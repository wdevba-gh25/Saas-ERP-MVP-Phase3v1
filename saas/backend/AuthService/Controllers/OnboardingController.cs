using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Shared;
using Shared.Entities;
using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace AuthService.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OnboardingController : ControllerBase
    {
        private readonly SaaSMvpContext _db;

        public OnboardingController(SaaSMvpContext db)
        {
            _db = db;
        }

        [HttpPost("new-organization")]
        public async Task<IActionResult> NewOrganization([FromBody] OnboardRequest req)
        {
            if (req == null) return BadRequest("Missing body.");
            if (!req.TermsAccepted) return BadRequest("Terms of Service must be accepted.");
            if (string.IsNullOrWhiteSpace(req.OrganizationName)) return BadRequest("OrganizationName is required.");

            if (req.Owner == null || req.Admin == null)
                return BadRequest("Owner and Admin sections are required.");

            if (string.IsNullOrWhiteSpace(req.Owner.FirstName) || string.IsNullOrWhiteSpace(req.Owner.LastName))
                return BadRequest("Owner first/last name required.");

            if (string.IsNullOrWhiteSpace(req.Admin.FirstName) || string.IsNullOrWhiteSpace(req.Admin.LastName))
                return BadRequest("Admin first/last name required.");

            // Check for duplicates (avoid double-clicks)
            if (await _db.Organizations.AnyAsync(o => o.Name == req.OrganizationName))
                return BadRequest("Organization name already exists.");

            var domain = SlugifyForDomain(req.OrganizationName) + ".demo";
            string ownerEmail = $"{Slugify(req.Owner.FirstName)}.{Slugify(req.Owner.LastName)}@{domain}".ToLowerInvariant();
            string adminEmail = $"{Slugify(req.Admin.FirstName)}.{Slugify(req.Admin.LastName)}@{domain}".ToLowerInvariant();

            if (await _db.Users.AnyAsync(u => u.Email == ownerEmail || u.Email == adminEmail))
                return BadRequest("Owner or Admin email already exists.");

            var ownerTempPassword = GeneratePassword(12);
            var adminTempPassword = GeneratePassword(12);
            var ownerHash = BCrypt.Net.BCrypt.HashPassword(ownerTempPassword);
            var adminHash = BCrypt.Net.BCrypt.HashPassword(adminTempPassword);

            var org = new Organization
            {
                OrganizationId = Guid.NewGuid(),
                Name = req.OrganizationName,
                CreatedAt = DateTime.UtcNow
            };
            _db.Organizations.Add(org);

            var owner = new User
            {
                UserId = Guid.NewGuid(),
                OrganizationId = org.OrganizationId,
                Email = ownerEmail,
                DisplayName = req.Owner.DisplayName ?? $"{req.Owner.FirstName} {req.Owner.LastName}",
                FirstName = req.Owner.FirstName,
                LastName = req.Owner.LastName,
                SSN = req.Owner.SSN,
                PasswordHash = ownerHash,
                TempPasswordPlain = ownerTempPassword,  // <--- NEW
                TempPasswordIssuedAt = DateTime.UtcNow,            // NEW
                MustChangePassword = true,
                IsActive = true,
                Status = "Active",
                CreatedAt = DateTime.UtcNow
            };
            _db.Users.Add(owner);

            var admin = new User
            {
                UserId = Guid.NewGuid(),
                OrganizationId = org.OrganizationId,
                Email = adminEmail,
                DisplayName = req.Admin.DisplayName ?? $"{req.Admin.FirstName} {req.Admin.LastName}",
                FirstName = req.Admin.FirstName,
                LastName = req.Admin.LastName,
                SSN = req.Admin.SSN,
                PasswordHash = adminHash,
                TempPasswordPlain = adminTempPassword, // <--- NEW
                TempPasswordIssuedAt = DateTime.UtcNow,               // NEW
                MustChangePassword = true,
                IsActive = true,
                Status = "Active",
                CreatedAt = DateTime.UtcNow
            };
            _db.Users.Add(admin);

            var ownerRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Owner");
            var adminRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Admin");

            if (ownerRole != null)
            {
                _db.UserRoles.Add(new UserRole
                {
                    UserId = owner.UserId,
                    RoleId = ownerRole.RoleId
                });
            }

            if (adminRole != null)
            {
                _db.UserRoles.Add(new UserRole
                {
                    UserId = admin.UserId,
                    RoleId = adminRole.RoleId
                });
            }

            await _db.SaveChangesAsync();

            Console.WriteLine($@"[ONBOARDING] Temporary credentials issued:
              Owner: {ownerEmail}   Password: {ownerTempPassword}
              Admin: {adminEmail}   Password: {adminTempPassword} ⚠️ WARNING: These temporary passwords will expire in 10 minutes. Please instruct the users to log in and change them immediately.");

            return CreatedAtAction(nameof(NewOrganization), new OnboardResponse
            {
                OrganizationId = org.OrganizationId,
                OwnerEmail = owner.Email,
                AdminEmail = admin.Email,
                Message =
                    $"Welcome {org.Name} to SaaS ERP Demo platform!\n\n" +
                    $"⚠️ The Owner and Admin temporary passwords will expire in 10 minutes. " +
                    $"Please log in and change them immediately. After they expire, contact IT Support for a reset."
            });
        }

        // ---------- helper methods ----------
        private static string SlugifyForDomain(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return "org";
            string normalized = input.Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var ch in normalized)
            {
                var uc = CharUnicodeInfo.GetUnicodeCategory(ch);
                if (uc != UnicodeCategory.NonSpacingMark) sb.Append(ch);
            }
            string noDiacritics = sb.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();

            var outSb = new StringBuilder();
            bool lastWasHyphen = false;
            foreach (char c in noDiacritics)
            {
                if (char.IsLetterOrDigit(c)) { outSb.Append(c); lastWasHyphen = false; }
                else if (!lastWasHyphen && (c == ' ' || c == '.' || c == '_' || c == '-' || c == '/'))
                { outSb.Append('-'); lastWasHyphen = true; }
            }
            var slug = outSb.ToString().Trim('-');
            return string.IsNullOrEmpty(slug) ? "org" : slug;
        }

        private static string Slugify(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return "user";
            string normalized = input.Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (var ch in normalized)
            {
                var uc = CharUnicodeInfo.GetUnicodeCategory(ch);
                if (uc != UnicodeCategory.NonSpacingMark) sb.Append(ch);
            }
            string noDiacritics = sb.ToString().Normalize(NormalizationForm.FormC);

            var outSb = new StringBuilder();
            foreach (char c in noDiacritics)
                if (char.IsLetterOrDigit(c)) outSb.Append(char.ToLowerInvariant(c));

            var slug = outSb.ToString();
            return string.IsNullOrEmpty(slug) ? "user" : slug;
        }

        private static string GeneratePassword(int length)
        {
            const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
            var data = new byte[length];
            RandomNumberGenerator.Fill(data);
            var chars = new char[length];
            for (int i = 0; i < length; i++)
                chars[i] = alphabet[data[i] % alphabet.Length];
            return new string(chars);
        }
    }

    public class OnboardRequest
    {
        [Required] public string OrganizationName { get; set; } = string.Empty;
        public string? TaxCode { get; set; }
        public string? ComplianceStatus { get; set; } = "Pending";
        [Required] public PersonDto Owner { get; set; } = new();
        [Required] public PersonDto Admin { get; set; } = new();
        public bool TermsAccepted { get; set; }
    }

    public class PersonDto
    {
        [Required] public string FirstName { get; set; } = string.Empty;
        [Required] public string LastName { get; set; } = string.Empty;
        public string? SSN { get; set; }
        public string? DisplayName { get; set; }
    }

    public class OnboardResponse
    {
        public Guid OrganizationId { get; set; }
        public string OwnerEmail { get; set; } = string.Empty;
        public string AdminEmail { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }
}