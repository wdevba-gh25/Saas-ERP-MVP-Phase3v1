using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Shared.Migrations
{
    /// <inheritdoc />
    public partial class SyncUserEntity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // No-op: DB already has new columns
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No-op: DB already has new columns
        }
    }
}
