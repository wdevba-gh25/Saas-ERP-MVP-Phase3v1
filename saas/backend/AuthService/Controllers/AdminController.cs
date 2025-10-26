using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Shared;
using Shared.Services;

namespace AuthService.Controllers
{
    [ApiController]
    [Route("api/admin")]
    [Authorize(Roles = "Owner,Admin")]
    public class AdminController : ControllerBase
    {
        private readonly SaaSMvpContext _db;
        private readonly ITenantContext _tenant;

        public AdminController(SaaSMvpContext db, ITenantContext tenant)
        {
            _db = db;
            _tenant = tenant;
        }

        /// <summary>
        /// Returns users in this organization.
        /// If ?createdBy=me, returns only users created by the current caller.
        /// </summary>
        [HttpGet("users")]
        [Authorize(Roles = "Owner,Admin")]
        public async Task<IActionResult> GetUsers(
            [FromServices] ITenantContext tenant,
            [FromQuery] string? createdBy = null)
        {
            var query = _db.Users
                .Where(u => u.OrganizationId == tenant.OrgId);

            if (string.Equals(createdBy, "me", StringComparison.OrdinalIgnoreCase))
            {
                // CreatedByUserId is set when creating users (see AuthController.CreateUser)
                query = query.Where(u => u.CreatedByUserId == tenant.UserId);
            }

            var users = await query
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .OrderByDescending(u => u.CreatedAt) // stable UX, safe
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
    }
}