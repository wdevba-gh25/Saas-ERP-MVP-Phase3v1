# SaaS.MVP (C#/.NET 8)

Multi-tenant SaaS demo with Web APIs, Minimal APIs, GraphQL (HotChocolate) and EF Core (Code-First).

## Run (Backend)
1. Open `SaaS.MVP.sln` in VS 2022 (or run `dotnet build`).
2. Start any backend projects:
   - AuthService (https://localhost:7240)
   - ProjectService (https://localhost:7241)
   - TenantMiddleware (https://localhost:7242)
   - GraphQLApi (https://localhost:7243/graphql)
3. On first run, EF Core auto-creates `saasmvp.db` SQLite file.

## Frontend
See `frontend/web/` (Vite + React + TS).

- Install: `npm install`
- Run: `npm run dev`

You can point `.env` vars to the backend URLs above.

## Notes
- Packages use floating versions within major ranges to ease restore on VS2022.
- Swap SQLite for LocalDB by changing `UseSqlite(...)` in each `Program.cs`.
