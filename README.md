# SaaS ERP MVP – Phase 3

Third-phase evolution of a multi-tenant SaaS ERP built with **.NET 8** (backend), **React 18 + Vite + TypeScript** (frontend), and a new **Nest.js Chatbot AI microservice** running under **WSL (Windows Subsystem for Linux)**.  
This phase delivers a complete AI-augmented ERP experience — combining PDF report generation, interactive chatbot assistance, and end-to-end orchestration via the ERP Gateway.

---

## Architecture Overview

### **Backend**
- Modular **.NET 8 microservice** ecosystem  
  - `AuthService`, `ProjectService`, `InventoryService`, `ProviderService`, `ERP-Gateway`, `GraphQLApi`, `Shared`
- **Schema-level multi-tenancy** with strict SQL Server isolation per organization
- Role hierarchy: **Owner / Admin / Analyst**
- ERP Gateway coordinates cross-service routing and AI orchestration
- Introduced **Decision Gateway** for intent-driven routing (`summarize`, `extract`, `recommend`)
- **AI Reports Pipeline** powered by **local Mistral 7B (LLM)** using a **sectionalized + sequentialized** prompt strategy
- **Audit Logs** and **Saga orchestration** for cancellable PDF/report jobs
- SQL Server (dev/prod) with seeded tenants and referential integrity

### **Frontend**
- **React 18 + Vite + TypeScript + Tailwind CSS**
- **Zustand** global store with tenant-aware authentication
- Role-based dashboards (`/owner`, `/admin`, `/analyst`)
- **AI Tools Page v2.0** – Pulse-style animations, cancelable jobs, and state-machine orchestration
- **Chatbot Page** – communicates with the Nest.js Chatbot service for contextual Q&A
- Multiple Axios domain clients sharing tenant headers through Zustand middleware

### **New Chatbot AI Service (Nest.js + Redis + PostgreSQL + Prisma)**
- Developed under **WSL Ubuntu 22.04** (`/home/admin1/chatbot-ai`)
- Exposes endpoints for chat intents and conversation state
- Connects to ERP Gateway for database-backed context retrieval
- Uses **Redis** for transient state and **PostgreSQL** for chat persistence
- Communicates asynchronously with **Mistral 7B (local CPU mode)** through ERP Gateway
- JSON-structured guardrailed responses for predictable UI parsing

---

## Prerequisites

### Backend (.NET) Environment
- [Visual Studio 2022](https://visualstudio.microsoft.com/vs/) with **.NET 8 SDK (8.0.x)**
- [SQL Server Developer Edition](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) or SQL Express
- [SQL Server Management Studio (SSMS)](https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms)
- [Git](https://git-scm.com/downloads)

### Frontend Environment
- [Node.js 18 LTS](https://nodejs.org/en/download/) + npm 9+
- [Vite CLI](https://vitejs.dev/guide/) (optional)
- [VS Code](https://code.visualstudio.com/) with:
  - Prettier – Code Formatter  
  - ESLint  
  - Tailwind CSS IntelliSense

### Chatbot AI Environment (WSL / Linux)
- **Windows 10/11 with WSL 2** enabled and **Ubuntu 22.04 LTS**
- [Node.js 20 LTS](https://nodejs.org/en/download/) (inside WSL)
- [Nest CLI](https://docs.nestjs.com/cli/overview) – `npm i -g @nestjs/cli`
- [PostgreSQL 15+](https://www.postgresql.org/download/linux/ubuntu/)
- [Redis 6+](https://redis.io/docs/latest/operate/oss-and-stack/install/install-redis/)
- [Prisma ORM](https://www.prisma.io/docs) – installed via `npm`
- [Python 3 + pip] (optional, for Mistral LLM control scripts)

---

## Database Setup (SQL Server)

1. Launch **SSMS** and execute the provided **`SaaSMVPFull.sql`** script.  
2. Verify creation of tenant schemas (`dbo`, `org_1`, `org_2`, …).
3. Update connection strings in each .NET service:

```json
"ConnectionStrings": {
  "DefaultConnection": "Server=localhost;Database=SaaSMvpDB;Trusted_Connection=True;TrustServerCertificate=True;"
}
Chatbot AI Setup (WSL / Linux)
Important: Windows ↔ WSL networking requires IP bridging.
Replace all http://localhost: references in the Windows frontend/backend with http://<WSL_IP>: (e.g. 172.25.16.1).
Obtain your WSL IP by running:

bash
Copiar código
ip addr show eth0 | grep inet
1 Clone & Open Project
Inside WSL:

bash
Copiar código
cd ~
git clone https://github.com/youruser/chatbot-ai.git
cd chatbot-ai
2 Install Dependencies
bash
Copiar código
npm install
3 Configure Environment
Create a .env file:

ini
Copiar código
DATABASE_URL="postgresql://admin1:password@localhost:5432/chatbot_ai"
REDIS_URL="redis://localhost:6379"
ERP_GATEWAY_BASE_URL="http://172.xx.xx.xx:5100"
AI_SERVER_URL="http://172.xx.xx.xx:6000"
PORT=7000
4 Prisma Initialization
bash
Copiar código
npx prisma migrate dev
npx prisma generate
5 Start Redis and PostgreSQL
bash
Copiar código
sudo service redis-server start
sudo service postgresql start
6 Launch the Chatbot Service
bash
Copiar código
npm run start:dev
The Chatbot API should now respond at:

arduino
Copiar código
http://172.xx.xx.xx:7000/api/chat
Backend (.NET) Setup
From Windows or WSL (depending on your preference):

bash
Copiar código
cd backend/AuthService
dotnet run

cd ../ProjectService
dotnet run

cd ../ERP-Gateway
dotnet run
ERP-Gateway communicates with both SQL Server and the Chatbot service.
Verify ports in each launchSettings.json file.

Frontend Setup
bash
Copiar código
cd frontend/web
npm install
npm run dev
Default URL: http://localhost:5173

Frontend .env.local:

ini
Copiar código
VITE_API_BASE=http://localhost:5100
VITE_AI_SERVER_URL=http://172.xx.xx.xx:6000
VITE_CHATBOT_SERVER_URL=http://172.xx.xx.xx:7000
AI Features Overview
AI Reports
Sequential prompt pipeline → contextual business summaries

PDF generation with cancellable Saga orchestration

CPU-only inference via local Mistral 7B (served by ERP Gateway)

Decision Gateway
Analyzes intent → routes to correct AI endpoint (summarize, recommend, extract)

AI Chatbot
End-to-end async chain:

pgsql
Copiar código
Chatbot UI → Chatbot Service → ERP Gateway → SQL Server → Mistral 7B → ERP Gateway → UI
Context retrieved through stored procedures

Responses normalized into JSON for structured rendering

Supports cancellation and state recovery via Redis Saga

Authentication & Authorization
JWT tokens include organizationId, role, and tenantSchema

[Authorize(Roles = "Owner, Admin, Analyst")] attributes control access

TenantContext middleware ensures schema isolation per request

Testing & Development
Swagger UI for each service (https://localhost:<port>/swagger)

Console logs verify AI report ↔ Chatbot ↔ Gateway round-trip

Test tenants included in seed data

Disable fake inference delay (for faster demos):

Search: HOW TO DISABLE LONG INFERENCE RUN CANCELLATION SIMULATION

Phase 3 Highlights
✅ Schema-level multi-tenant enforcement
✅ Role-specific dashboards & UX
✅ Decision Gateway for AI intent routing
✅ Sectionalized + Sequentialized AI Reports
✅ True State Machine + Saga cancellation flows
✅ Chatbot microservice (Nest.js + Redis + PostgreSQL)
✅ Async cross-service pipeline (ERP ↔ Chatbot ↔ Mistral)
✅ CPU-only LLM architecture for offline demo
✅ Refined UX with Pulse animation & overlay blocking
✅ Ready for AWS SageMaker GPU Phase 3.1 upgrade

Future Work / Phase 4 Preview
Transition Mistral 7B to AWS SageMaker GPU

Parallelized Context Retriever for faster AI responses

AI Hub Dashboard unifying reports + chat

WebSocket-based streaming for real-time AI interactions

Advanced RBAC and audit analytics via GraphQL

Author: Devland FS24
Repository: GitHub – SaaS-ERP-MVP-Phase3
License: MIT

## Appendix – WSL ↔ Windows Networking Guide

Because the **Chatbot AI microservice** runs inside WSL (Ubuntu 22.04), while the **ERP Gateway (.NET)** and **Frontend (React)** typically run on Windows, you must bridge the network correctly.  
Windows and Linux treat `localhost` differently — WSL services are not automatically visible to Windows processes under `localhost`.

---

### 1 Find Your WSL IP Address
Inside your Ubuntu WSL console, run:
```bash
ip addr show eth0 | grep inet
You’ll see an output like:

nginx
Copiar código
inet 172.25.16.1/20 brd 172.25.31.255 scope global eth0
The first address (172.25.16.1 in this example) is your WSL IP.

2 Replace localhost with WSL IP in Configs
Every Windows-side configuration that targets the Chatbot or AI server must use the WSL IP instead of localhost.

Examples

Component	Key	Example
.env.local (React)	VITE_CHATBOT_SERVER_URL	http://172.25.16.1:7000
.env.local (React)	VITE_AI_SERVER_URL	http://172.25.16.1:6000
.env (ERP Gateway)	AI_SERVER_URL	http://172.25.16.1:6000
.env (ERP Gateway)	CHATBOT_SERVER_URL	http://172.25.16.1:7000

3 Test Connectivity from Windows
Before running your frontend or backend, test the connection:

powershell
Copiar código
curl http://172.25.16.1:7000/api/chat
If it responds (even with an error message), the service is reachable.

If it hangs or fails, check your WSL firewall and ensure the service listens on 0.0.0.0, not localhost.

4 Modify Nest.js to Bind to All Interfaces
In main.ts of your Chatbot AI service, ensure:

typescript
Copiar código
await app.listen(process.env.PORT || 7000, '0.0.0.0');
This allows Windows applications to reach it via the WSL IP.

5 Optional – Use Dynamic IP Resolution
WSL IPs change on reboot. To make configs resilient:

Add this PowerShell script to C:\Users\<you>\wsl-refresh-ip.ps1:

powershell
Copiar código
$ip = wsl hostname -I
Write-Output "Current WSL IP: $ip"
(Get-Content .env.local) -replace '172\.\d+\.\d+\.\d+', $ip.Trim() | Set-Content .env.local
Run it whenever WSL restarts to auto-update .env.local.

6 Optional – Reverse Proxy for Simplicity
You can use Nginx on Windows or IIS Express to proxy Windows localhost:7000 → WSL 172.x.x.x:7000
This way, you can keep using http://localhost:7000 consistently.

✅ Quick Checklist
Task	Expected Result
ip addr show eth0	Shows WSL IP
curl http://172.xx.xx.xx:7000/api/chat	Returns chatbot JSON
ERP Gateway → Chatbot	Logs “Connected to AI service”
React → Chatbot	Chat UI responds successfully

Summary:
Always expose WSL services on 0.0.0.0, use your 172.x.x.x IP in configs, and verify connectivity with curl.
This ensures smooth Windows ↔ Linux interop for your AI Chatbot and ERP Gateway.
