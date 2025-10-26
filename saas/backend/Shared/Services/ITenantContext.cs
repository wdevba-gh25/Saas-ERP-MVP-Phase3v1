using Microsoft.AspNetCore.Http;
using System;
using System.Security.Claims;

namespace Shared.Services
{
    public interface ITenantContext
    {
        Guid OrgId { get; }
        Guid UserId { get; }
        bool HasContext { get; }
    }

    public sealed class TenantContext : ITenantContext
    {
        public Guid OrgId { get; }
        public Guid UserId { get; }
        public bool HasContext { get; }

        public TenantContext(IHttpContextAccessor http)
        {
            var user = http.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated != true)
            {
                HasContext = false;
                return;
            }

            var orgClaim = user.FindFirst("organizationId")?.Value;
            var userClaim = user.FindFirst("userId")?.Value;

            if (!Guid.TryParse(orgClaim, out var orgId))
                throw new UnauthorizedAccessException("Missing or invalid organizationId");
            if (!Guid.TryParse(userClaim, out var userId))
                throw new UnauthorizedAccessException("Missing or invalid userId");

            OrgId = orgId;
            UserId = userId;
            HasContext = true;
        }
    }
}