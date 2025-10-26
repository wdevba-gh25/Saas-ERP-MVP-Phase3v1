var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Middleware to extract TenantId (stubbed for MVP)
app.Use(async (context, next) =>
{
    context.Items["TenantId"] = "demo-tenant";
    await next();
});

app.MapGet("/", () => "Tenant middleware running");
app.Run();
