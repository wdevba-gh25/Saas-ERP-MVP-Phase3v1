using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shared.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationIdStrategyToUserProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UserProjects_Projects",
                table: "UserProjects");

            migrationBuilder.DropForeignKey(
                name: "FK_UserProjects_Users",
                table: "UserProjects");

            migrationBuilder.AddColumn<DateTime>(
                name: "EndedAt",
                table: "UserProjects",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPrimary",
                table: "UserProjects",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "UserProjects",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));
 
            // Backfill OrganizationId in UserProjects using Projects.OrganizationId
            migrationBuilder.Sql(@"
                UPDATE up
                SET up.OrganizationId = p.OrganizationId
                FROM UserProjects up
                INNER JOIN Projects p ON p.ProjectId = up.ProjectId;
            ");

            // Ensure UserProjects.OrganizationId matches Users.OrganizationId for the same UserId
            migrationBuilder.Sql(@"
                UPDATE up
                SET up.OrganizationId = u.OrganizationId
                FROM UserProjects up
                INNER JOIN Users u ON up.UserId = u.UserId;
            ");

            // Third pass: remove cross-org assignments (User.OrgId != Project.OrgId)
            migrationBuilder.Sql(@"
                DELETE up
                FROM UserProjects up
                LEFT JOIN Projects p
                  ON up.ProjectId = p.ProjectId AND up.OrganizationId = p.OrganizationId
                WHERE p.ProjectId IS NULL;
            ");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Users_UserId_OrganizationId",
                table: "Users",
                columns: new[] { "UserId", "OrganizationId" });

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Projects_ProjectId_OrganizationId",
                table: "Projects",
                columns: new[] { "ProjectId", "OrganizationId" });

            migrationBuilder.CreateIndex(
                name: "IX_UserProjects_ProjectId_OrganizationId",
                table: "UserProjects",
                columns: new[] { "ProjectId", "OrganizationId" });

            migrationBuilder.CreateIndex(
                name: "IX_UserProjects_UserId_OrganizationId",
                table: "UserProjects",
                columns: new[] { "UserId", "OrganizationId" });

            migrationBuilder.CreateIndex(
                name: "IX_UserProjects_UserId_ProjectId",
                table: "UserProjects",
                columns: new[] { "UserId", "ProjectId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_UserProjects_Projects_ProjectId_OrganizationId",
                table: "UserProjects",
                columns: new[] { "ProjectId", "OrganizationId" },
                principalTable: "Projects",
                principalColumns: new[] { "ProjectId", "OrganizationId" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_UserProjects_Users_UserId_OrganizationId",
                table: "UserProjects",
                columns: new[] { "UserId", "OrganizationId" },
                principalTable: "Users",
                principalColumns: new[] { "UserId", "OrganizationId" },
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
