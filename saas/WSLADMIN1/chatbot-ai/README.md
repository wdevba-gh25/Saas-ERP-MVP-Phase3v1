# Chatbot AI (Nest.js WebSockets) — ERP-Scoped

Real-time Chatbot AI service using Nest.js + Socket.IO with **Redis Pub/Sub** (optional) and **Prisma/PostgreSQL** (optional).
Designed to integrate with your existing **Python AI Gateway** and **Mistral 7B (CPU)**.

## Quick Start

```bash
# 1) Start infra (Redis + Postgres)
docker compose up -d

# 2) Install deps
npm install

# 3) Setup Prisma (optional but recommended for screenshots/portfolio)
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev

# 4) Dev run
npm run start:dev
```

The WebSocket server listens on `ws://localhost:3010`.

## Events

- `chat:ask` — payload:
  ```json
  { "projectId": "uuid", "question": "Should we increase Saab battery stock..." }
  ```
- Streams back:
  - `chat:chunk` { text }
  - `chat:done`
  - `chat:error` { message }

## Env Vars

See `.env.example` for defaults:
- `AI_BASE` → Python AI Gateway (`/ai/context/project/:id`)
- `LOCAL_LLM_URL` → your local Mistral 7B completions endpoint
- `FRONTEND_ORIGIN` → CORS for Socket.IO
- `REDIS_URL` → if set, enables Redis adapter (multi-instance ready)
- `DATABASE_URL` → enables Prisma transcript logging (Conversation model)

## Notes
- If `REDIS_URL` is not set, WebSocket works single-instance.
- If `DATABASE_URL` is not set, transcript persistence is skipped.
