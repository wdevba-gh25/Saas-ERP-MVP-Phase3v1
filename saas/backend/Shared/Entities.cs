using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Shared.Entities
{
    public class Organization
    {
        public Guid OrganizationId { get; set; }

        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<User> Users { get; set; } = new List<User>();
        public ICollection<Project> Projects { get; set; } = new List<Project>();
    }

    public class User
    {
        [Key]
        public Guid UserId { get; set; }

        [ForeignKey(nameof(Organization))]
        public Guid OrganizationId { get; set; }

        public Guid? CreatedByUserId { get; set; }

        [MaxLength(320)]
        public string Email { get; set; } = string.Empty;

        public string PasswordHash { get; set; } = string.Empty;

        [MaxLength(200)]
        public string? TempPasswordPlain { get; set; }

        public DateTime? TempPasswordIssuedAt { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? SSN { get; set; }

        public bool MustChangePassword { get; set; } = true;

        public string Status { get; set; } = "Active";

        public Organization? Organization { get; set; }
        public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
        public ICollection<UserProject> UserProjects { get; set; } = new List<UserProject>();
    }

    public class Role
    {
        public Guid RoleId { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    }

    public class UserRole
    {
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;

        public Guid RoleId { get; set; }
        public Role Role { get; set; } = null!;
    }

    public class Project
    {
        public Guid ProjectId { get; set; }
        public Guid OrganizationId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public Organization? Organization { get; set; }
        public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
        public ICollection<UserProject> UserProjects { get; set; } = new List<UserProject>();
    }

    public class TaskItem
    {
        public Guid TaskItemId { get; set; }
        public Guid ProjectId { get; set; }
        public Guid? AssignedTo { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Status { get; set; } = "Pending";
        public DateTime? DueDate { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public Project? Project { get; set; }
        public User? AssignedUser { get; set; }
    }

    public class AuditLog
    {
        public long AuditLogId { get; set; }
        public Guid UserId { get; set; }
        public string Action { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string? Details { get; set; }

        public User? User { get; set; }
    }

    // Phase 2 additions

    public class UserProject
    {
        [Key]
        public Guid UserProjectId { get; set; }

        [ForeignKey(nameof(User))]
        public Guid UserId { get; set; }

        [ForeignKey(nameof(Project))]
        public Guid ProjectId { get; set; }

        // Tie assignment to a specific tenant and enable cross-table org consistency.
        public Guid OrganizationId { get; set; }

        // Current/primary semantics for UX (enforced by backend rules, not DB)
        public bool IsPrimary { get; set; } = false;

        public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EndedAt { get; set; }

        public User? User { get; set; }
        public Project? Project { get; set; }
    }

    public class Sale
    {
        [Key]
        public Guid SaleId { get; set; }

        [ForeignKey(nameof(Project))]
        public Guid ProjectId { get; set; }

        [MaxLength(200)]
        public string ProductName { get; set; } = string.Empty;

        public int Quantity { get; set; }
        public decimal Amount { get; set; }

        public DateTime SaleDate { get; set; } = DateTime.UtcNow;

        public Project? Project { get; set; }
    }

    public class Inventory
    {
        [Key]
        public Guid InventoryId { get; set; }

        [ForeignKey(nameof(Project))]
        public Guid ProjectId { get; set; }

        [MaxLength(200)]
        public string ProductName { get; set; } = string.Empty;

        public int StockLevel { get; set; }
        public int ReorderLevel { get; set; }

        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

        public Project? Project { get; set; }
    }

    public class Provider
    {
        public Guid ProviderId { get; set; }
        public Guid OrganizationId { get; set; }
        public string Name { get; set; } = default!;
        public string? Country { get; set; }
        public byte Rating { get; set; } = 3;
        public short AvgDeliveryDays { get; set; } = 7;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public Organization? Organization { get; set; }
        public ICollection<ProviderProduct> ProviderProducts { get; set; } = new List<ProviderProduct>();
    }

    public class ProviderProduct
    {
        public Guid ProviderProductId { get; set; }
        public Guid OrganizationId { get; set; }
        public Guid ProviderId { get; set; }
        public string ProductName { get; set; } = default!;
        public bool IsPreferred { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public Organization? Organization { get; set; }
        public Provider? Provider { get; set; }
    }
}