using Microsoft.EntityFrameworkCore;
using Shared.Entities;

namespace Shared
{
    public class SaaSMvpContext : DbContext
    {
        public SaaSMvpContext(DbContextOptions<SaaSMvpContext> options) : base(options)
        {
        }

        // Core entities
        public DbSet<User> Users { get; set; }
        public DbSet<Role> Roles { get; set; }
        public DbSet<UserRole> UserRoles { get; set; }
        public DbSet<Organization> Organizations { get; set; }
        public DbSet<Project> Projects { get; set; }
        public DbSet<TaskItem> Tasks { get; set; }
        public DbSet<AuditLog> AuditLogs { get; set; }

        // Phase 2 additions
        public DbSet<UserProject> UserProjects { get; set; }
        public DbSet<Sale> Sales { get; set; }
        public DbSet<Inventory> Inventory { get; set; }

        public DbSet<Provider> Providers => Set<Provider>();
        public DbSet<ProviderProduct> ProviderProducts => Set<ProviderProduct>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Users: composite unique index (per-tenant email)
            modelBuilder.Entity<User>()
                .HasIndex(u => new { u.OrganizationId, u.Email })
                .IsUnique();

            // Alternate keys so we can reference (Id, OrganizationId) as principals
            modelBuilder.Entity<User>()
                .HasAlternateKey(u => new { u.UserId, u.OrganizationId });
            modelBuilder.Entity<Project>()
                .HasAlternateKey(p => new { p.ProjectId, p.OrganizationId });

            // UserRoles: composite PK
            modelBuilder.Entity<UserRole>()
                .HasKey(ur => new { ur.UserId, ur.RoleId });

            modelBuilder.Entity<UserRole>()
                .HasOne(ur => ur.User)
                .WithMany(u => u.UserRoles)
                .HasForeignKey(ur => ur.UserId);

            modelBuilder.Entity<UserRole>()
                .HasOne(ur => ur.Role)
                .WithMany(r => r.UserRoles)
                .HasForeignKey(ur => ur.RoleId);

            // UserProjects: explicit join entity
            modelBuilder.Entity<UserProject>()
                .HasKey(up => up.UserProjectId);

            // Ensure User and Project belong to the SAME Organization
            modelBuilder.Entity<UserProject>()
                .HasOne(up => up.User)
                .WithMany(u => u.UserProjects)
                .HasForeignKey(up => new { up.UserId, up.OrganizationId })
                .HasPrincipalKey(u => new { u.UserId, u.OrganizationId })
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<UserProject>()
                .HasOne(up => up.Project)
                .WithMany(p => p.UserProjects)
                .HasForeignKey(up => new { up.ProjectId, up.OrganizationId })
                .HasPrincipalKey(p => new { p.ProjectId, p.OrganizationId })
                .OnDelete(DeleteBehavior.Cascade);

            // Prevent duplicate same-user/same-project rows
            modelBuilder.Entity<UserProject>()
                .HasIndex(up => new { up.UserId, up.ProjectId })
                .IsUnique();

            // NOTE: IsPrimary uniqueness is enforced in the backend by role.
            // No filtered unique index at the DB level.

            // Sales: belongs to Project
            modelBuilder.Entity<Sale>()
                .HasKey(s => s.SaleId);

            modelBuilder.Entity<Sale>()
                .HasOne(s => s.Project)
                .WithMany()
                .HasForeignKey(s => s.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Sale>()
                .Property(s => s.Amount)
                .HasColumnType("decimal(18,2)");

            // Inventory: belongs to Project
            modelBuilder.Entity<Inventory>()
                .HasKey(i => i.InventoryId);

            modelBuilder.Entity<Inventory>()
                .HasOne(i => i.Project)
                .WithMany()
                .HasForeignKey(i => i.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            // Providers: belongs to Organization
            modelBuilder.Entity<Provider>(eb =>
            {
                eb.HasKey(x => x.ProviderId);
                eb.HasOne(x => x.Organization)
                  .WithMany()
                  .HasForeignKey(x => x.OrganizationId)
                  .OnDelete(DeleteBehavior.Restrict);
                eb.HasIndex(x => x.OrganizationId);
            });

            // ProviderProduct: belongs to Provider
            modelBuilder.Entity<ProviderProduct>(eb =>
            {
                eb.HasKey(x => x.ProviderProductId);
                eb.Property(x => x.ProductName).HasMaxLength(100);
                eb.HasOne(x => x.Organization)
                  .WithMany()
                  .HasForeignKey(x => x.OrganizationId)
                  .OnDelete(DeleteBehavior.Restrict);
                eb.HasOne(x => x.Provider)
                  .WithMany(p => p.ProviderProducts)
                  .HasForeignKey(x => x.ProviderId)
                  .OnDelete(DeleteBehavior.Cascade);

                eb.HasIndex(x => new { x.OrganizationId, x.ProductName });
                eb.HasIndex(x => new { x.OrganizationId, x.ProductName })
                  .IsUnique()
                  .HasFilter("[IsPreferred] = 1");
            });
        }
    }
}