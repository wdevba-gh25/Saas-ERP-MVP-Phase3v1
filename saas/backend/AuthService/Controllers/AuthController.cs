using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Shared;
using Shared.Entities;
using Shared.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace AuthService.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly SaaSMvpContext _db;
        private readonly IConfiguration _config;

        public AuthController(SaaSMvpContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        // POST: /api/auth/signup
        [HttpPost("signup")]
        public async Task<IActionResult> Signup(SignupRequest req)
        {
            try
            {
                if (await _db.Users.AnyAsync(u => u.OrganizationId == req.OrganizationId && u.Email == req.Email))
                    return Conflict(new { message = "Email already exists in this organization." });

                var hash = BCrypt.Net.BCrypt.HashPassword(req.Password);

                var user = new User
                {
                    UserId = Guid.NewGuid(),
                    OrganizationId = req.OrganizationId,
                    Email = req.Email,
                    PasswordHash = hash,
                    DisplayName = req.DisplayName,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    Status = "Active",
                    MustChangePassword = false
                };

                var ownerRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Owner");
                if (ownerRole != null)
                    _db.UserRoles.Add(new UserRole { UserId = user.UserId, RoleId = ownerRole.RoleId });

                _db.Users.Add(user);
                await _db.SaveChangesAsync();

                // Reload user with projects for JWT claim hydration
                var createdUser = await _db.Users
                    .Include(u => u.UserRoles)
                        .ThenInclude(ur => ur.Role)
                    .Include(u => u.UserProjects)
                    .FirstOrDefaultAsync(u => u.UserId == user.UserId);

                var token = GenerateJwt(createdUser!, false);
                return Ok(new { token });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SIGNUP ERROR] {ex.Message}\n{ex.StackTrace}");
                return StatusCode(500, "An error occurred during registration.");
            }
        }

        // GET: /api/admin/users (scoped to tenant org)
        [HttpGet("users")]
        [Authorize(Roles = "Owner,Admin")]
        public async Task<IActionResult> GetUsers([FromServices] ITenantContext tenant)
        {
            var users = await _db.Users
                .Where(u => u.OrganizationId == tenant.OrgId)
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .Select(u => new
                {
                    u.UserId,
                    u.Email,
                    u.DisplayName,
                    u.FirstName,
                    u.LastName,
                    u.Status,
                    Roles = u.UserRoles.Select(ur => ur.Role.Name).ToList()
                })
                .ToListAsync();

            return Ok(users);
        }

        // POST: /api/auth/users (per-org email + domain enforcement)
        [HttpPost("users")]
        [Authorize(Roles = "Owner,Admin")]
        public async Task<IActionResult> CreateUser([FromBody] NewUserRequest req, [FromServices] ITenantContext tenant)
        {
            try
            {
                // ---- Enforce per-org domain via the creator's email domain (robust) ----
                // Normalize incoming email early
                var normalizedEmail = (req.Email ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(normalizedEmail))
                    return BadRequest(new { message = "Email is required." });

                // Get the creator's email (prefer JWT claim, fall back to DB)
                var creatorEmail = User?.FindFirst(ClaimTypes.Email)?.Value;
                if (string.IsNullOrWhiteSpace(creatorEmail))
                {
                    creatorEmail = await _db.Users
                        .Where(u => u.UserId == tenant.UserId)
                        .Select(u => u.Email)
                        .FirstOrDefaultAsync();
                }

                string? domain = null;
                var at = creatorEmail?.IndexOf('@') ?? -1;
                if (at > 0 && at < (creatorEmail?.Length ?? 0) - 1)
                    domain = creatorEmail!.Substring(at).ToLowerInvariant();  // includes '@'

                if (!string.IsNullOrEmpty(domain) &&
                    !normalizedEmail.ToLowerInvariant().EndsWith(domain))
                {
                    return BadRequest(new
                    {
                        code = "ForeignDomain",
                        message = $"Email must end with {domain}.",
                        domain
                    });
                }




                // Check uniqueness within the same org
                var exists = await _db.Users
                    .AnyAsync(u => u.OrganizationId == tenant.OrgId && u.Email == req.Email);

                if (exists)
                    return Conflict(new { message = "Attempt to create new User with existing email." });

                var hash = BCrypt.Net.BCrypt.HashPassword(req.Password);

                var user = new User
                {
                    UserId = Guid.NewGuid(),
                    OrganizationId = tenant.OrgId,
                    CreatedByUserId = tenant.UserId,
                    Email = normalizedEmail,
                    PasswordHash = hash,
                    DisplayName = req.DisplayName,
                    FirstName = req.FirstName,
                    LastName = req.LastName,
                    SSN = req.SSN,
                    IsActive = true,
                    MustChangePassword = true,
                    Status = "Active",
                    CreatedAt = DateTime.UtcNow,
                    TempPasswordPlain = req.Password,
                    TempPasswordIssuedAt = DateTime.UtcNow
                };

                var memberRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Member");
                if (memberRole != null)
                    _db.UserRoles.Add(new UserRole { UserId = user.UserId, RoleId = memberRole.RoleId });

                _db.Users.Add(user);
                await _db.SaveChangesAsync();

                return Ok(new { user.UserId, user.Email, user.DisplayName });
            }
            catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx &&
                                               (sqlEx.Number == 2627 || sqlEx.Number == 2601))
            {
                return Conflict(new { message = "Attempt to create new User with existing email." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CREATE USER ERROR] {ex.Message}\n{ex.StackTrace}");
                return StatusCode(500, "An error occurred while creating the user.");
            }
        }

        // POST: /api/auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginRequest req)
        {
            try
            {
                var user = await _db.Users
                        .IgnoreQueryFilters()
                        .Include(u => u.UserRoles)
                            .ThenInclude(ur => ur.Role)
                            .Include(u => u.UserProjects) //ensure projects loaded
                        .FirstOrDefaultAsync(u => u.Email == req.Email);

                if (user == null)
                    return Unauthorized("Invalid credentials.");

                var ok = BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash);

                if (!ok && user.PasswordHash == req.Password)
                {
                    user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
                    await _db.SaveChangesAsync();
                    ok = true;
                }

                if (!ok)
                    return Unauthorized("Invalid credentials.");

                if (user.MustChangePassword)
                {
                    var issuedAt = user.TempPasswordIssuedAt;
                    var expired = !issuedAt.HasValue || issuedAt.Value.AddMinutes(10) < DateTime.UtcNow;

                    if (expired)
                        return Unauthorized("Temporary password has expired. Please contact IT Support to request a reset.");

                    var tempToken = GenerateJwt(user, isTemporary: true);
                    return Ok(new { mustChangePassword = true, token = tempToken });
                }

                var token = GenerateJwt(user, false);
                return Ok(new { token });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[LOGIN ERROR] {ex.Message}\n{ex.StackTrace}");
                return StatusCode(500, "An error occurred during login.");
            }
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> Me()
        {
            var userIdClaim = User.FindFirst("userId")?.Value;
            var orgIdClaim = User.FindFirst("organizationId")?.Value;
            var emailClaim = User.FindFirst(ClaimTypes.Email)?.Value ?? User.Identity?.Name;
            var roleClaims = User.FindAll(ClaimTypes.Role).Select(c => c.Value).ToList();

            if (!string.IsNullOrEmpty(userIdClaim) &&
                Guid.TryParse(userIdClaim, out var userId) &&
                Guid.TryParse(orgIdClaim, out var orgId) &&
                roleClaims.Count > 0)
            {
                var projectIdClaim = User.FindFirst("projectId")?.Value;
                Guid? projectId = null;
                if (!string.IsNullOrEmpty(projectIdClaim) && Guid.TryParse(projectIdClaim, out var pid))
                    projectId = pid;

                return Ok(new
                {
                    UserId = userId,
                    OrganizationId = orgId,
                    Email = emailClaim,
                    Roles = roleClaims,
                    ProjectId = projectId
                });
            }

            if (string.IsNullOrEmpty(userIdClaim))
                return Unauthorized("Missing userId in token");

            var guid = Guid.Parse(userIdClaim);
            var user = await _db.Users
                .IgnoreQueryFilters()
                .Where(u => u.UserId == guid)
                .Select(u => new
                {
                    u.UserId,
                    u.OrganizationId,
                    u.Email,
                    u.DisplayName,
                    u.FirstName,
                    u.LastName,
                    u.Status,
                    Roles = u.UserRoles.Select(ur => ur.Role.Name).ToList()
                })
                .FirstOrDefaultAsync();

            if (user == null)
                return NotFound("User not found");

            return Ok(user);
        }

        [HttpPost("change-password")]
        [Authorize]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
        {
            var userIdStr = User.FindFirst("userId")?.Value;
            if (string.IsNullOrEmpty(userIdStr))
                return Unauthorized("Missing userId claim");

            var userId = Guid.Parse(userIdStr);
            var user = await _db.Users
                .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.UserId == userId);

            if (user == null) return NotFound("User not found");

            if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
                return BadRequest("Current password is incorrect");

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            user.MustChangePassword = false;
            user.TempPasswordPlain = null;
            user.TempPasswordIssuedAt = null;
            await _db.SaveChangesAsync();

            var newToken = GenerateJwt(user, false);
            return Ok(new { token = newToken });
        }

        private string GenerateJwt(User user, bool isTemporary)
        {
            var jwt = _config.GetSection("Jwt");
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Email),
                new Claim("userId", user.UserId.ToString()),
                new Claim("organizationId", user.OrganizationId.ToString()),
                new Claim(ClaimTypes.Email, user.Email ?? ""),
                new Claim("displayName", user.DisplayName ?? "")
            };

            //Attach primary projectId claim if available
            var primaryProjectId = user.UserProjects
                 ?.FirstOrDefault(up => up.IsPrimary)?.ProjectId
                 ?? user.UserProjects?.FirstOrDefault()?.ProjectId;

            if (primaryProjectId != Guid.Empty && primaryProjectId != null)
            {
                claims.Add(new Claim("projectId", primaryProjectId.ToString()!));
            }


            if (user.UserRoles != null)
            {
                foreach (var ur in user.UserRoles)
                {
                    if (!string.IsNullOrWhiteSpace(ur.Role?.Name))
                        claims.Add(new Claim(ClaimTypes.Role, ur.Role.Name));
                }
            }

            if (isTemporary)
                claims.Add(new Claim("pwdchg", "1"));

            var expires = isTemporary
                ? DateTime.UtcNow.AddMinutes(10)
                : DateTime.UtcNow.AddMinutes(int.Parse(jwt["ExpiresMinutes"] ?? "60"));

            var token = new JwtSecurityToken(
                issuer: jwt["Issuer"],
                audience: jwt["Audience"],
                claims: claims,
                expires: expires,
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    // === Request DTOs ===
    public class SignupRequest
    {
        public Guid OrganizationId { get; set; }
        public string Email { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class NewUserRequest
    {
        public string Email { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? SSN { get; set; }
        public string Password { get; set; } = "TempPass123!";
        public List<string> Roles { get; set; } = new();
    }

    public class ChangePasswordRequest
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }
}