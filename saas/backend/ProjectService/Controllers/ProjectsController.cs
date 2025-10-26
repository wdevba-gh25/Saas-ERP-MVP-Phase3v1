using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Shared;
using Shared.Entities;
using Shared.Services;

namespace ProjectService.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // controller requires auth
    public class ProjectsController : ControllerBase
    {
        private readonly SaaSMvpContext _db;
        private readonly ITenantContext _tenant;

        public ProjectsController(SaaSMvpContext db, ITenantContext tenant)
        {
            _db = db;
            _tenant = tenant;
        }


        // GET: /api/projects
        [HttpGet("/api/projects")]
        [Authorize(Roles = "Owner,Admin")] // keep list restricted
        public async Task<IActionResult> GetProjects()
        {
            var projects = await _db.Projects
                .Where(p => p.OrganizationId == _tenant.OrgId)
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new
                {
                    p.ProjectId,
                    p.Name,
                    p.Description,
                    p.CreatedAt
                })
                .ToListAsync();

            return Ok(projects);
        }

        // POST: /api/projects
        [HttpPost]
        [Authorize(Roles = "Owner,Admin")] // keep create restricted
        public async Task<IActionResult> CreateProject([FromBody] CreateProjectRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { message = "Project name is required." });

            var project = new Project
            {
                ProjectId = Guid.NewGuid(),
                OrganizationId = _tenant.OrgId,
                Name = req.Name,
                Description = req.Description,
                CreatedAt = DateTime.UtcNow
            };

            _db.Projects.Add(project);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                project.ProjectId,
                project.Name,
                project.Description,
                project.CreatedAt
            });
        }

        // GET: /api/projects/{id}
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetProject(Guid id)
        {
            var project = await _db.Projects
                .Where(p => p.ProjectId == id && p.OrganizationId == _tenant.OrgId)
                .Select(p => new
                {
                    p.ProjectId,
                    p.Name,
                    p.Description,
                    p.CreatedAt
                })
                .FirstOrDefaultAsync();

            if (project == null)
                return NotFound(new { message = "Project not found in your organization." });

            return Ok(project);
        }


        [HttpGet("current")]
        [Authorize] // allow any authenticated role to see their current project
        public async Task<IActionResult> GetCurrentProject()
        {
            var userIdClaim = User.FindFirst("userId")?.Value;
            var orgIdClaim = User.FindFirst("organizationId")?.Value;

            if (userIdClaim == null || orgIdClaim == null)
                return Unauthorized("Missing claims");

            var userId = Guid.Parse(userIdClaim);
            var orgId = Guid.Parse(orgIdClaim);

            var up = await _db.UserProjects
                .Include(x => x.Project)
                .Where(x => x.OrganizationId == orgId &&
                            x.UserId == userId &&
                            x.EndedAt == null)
                .OrderByDescending(x => x.IsPrimary)      // prefer flagged primary
                .ThenByDescending(x => x.AssignedAt)      // else latest assignment
                .FirstOrDefaultAsync();

            if (up == null)
                return NotFound("No active project assigned");

            return Ok(new
            {
                ProjectId = up.ProjectId,
                ProjectName = up.Project?.Name,
                IsPrimary = up.IsPrimary
            });
        }


        public class CreateProjectRequest
        {
            public string Name { get; set; } = string.Empty;
            public string? Description { get; set; }
        }
    }
}