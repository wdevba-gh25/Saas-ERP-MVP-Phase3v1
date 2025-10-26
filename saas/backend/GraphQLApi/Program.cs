using HotChocolate.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Shared;
using Shared.Entities;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;

var builder = WebApplication.CreateBuilder(args);


builder.Services.AddDbContext<SaaSMvpContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>();

// JWT validation must match AuthService issuer/audience/key
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Keep in sync with AuthService/appsettings.json
        var jwtSection = builder.Configuration.GetSection("Jwt");
        var signingKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(jwtSection["Key"]!)
        );

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtSection["Issuer"],
            ValidateAudience = true,
            ValidAudience = jwtSection["Audience"],
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromSeconds(30) // same as AuthService
        };


        options.RequireHttpsMetadata = false; // dev
        options.SaveToken = true;
    });


var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SaaSMvpContext>();
    db.Database.Migrate();
}

app.UseAuthentication();
app.UseAuthorization();


app.MapGraphQL("/graphql");
app.Run();

// GraphQL resolvers
public class Query
{
        // Require auth and filter by tenant from JWT
     [HotChocolate.Authorization.Authorize]
    public IQueryable<Project> GetProjects([Service] SaaSMvpContext db, ClaimsPrincipal user)
    {
     

        var orgIdClaim = user.FindFirst("organizationId")?.Value;
        if (string.IsNullOrWhiteSpace(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
        {
                return Enumerable.Empty<Project>().AsQueryable();
        }

        var allmyprojects = db.Projects.ToList();
        //var myorgprojects = db.Projects.Where(p => p.OrganizationId == orgId);
        var myorgprojects = new List<Project>();
         myorgprojects = allmyprojects.Where(p => p.OrganizationId == orgId).ToList();
        // return db.Projects.Where(p => p.OrganizationId == orgId);
        return myorgprojects.AsQueryable();
    }
}

public class Mutation
{

    [HotChocolate.Authorization.Authorize]
    public TaskItem CreateTask(Guid projectId, string title, [Service] SaaSMvpContext db, ClaimsPrincipal user)
    {
        //var task = new TaskItem { ProjectId = projectId, Title = title };
        var orgIdClaim = user.FindFirst("organizationId")?.Value;
                if (string.IsNullOrWhiteSpace(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
            throw new GraphQLException("Missing organization context.");
        
               // Optional: reject cross-tenant writes by validating project belongs to org
        var project = db.Projects.FirstOrDefault(p => p.ProjectId == projectId && p.OrganizationId == orgId)
                              ?? throw new GraphQLException("Project not found in your organization.");
        
        var task = new TaskItem { ProjectId = projectId, Title = title };
        db.Tasks.Add(task);
        db.SaveChanges();
        return task;
    }
}


