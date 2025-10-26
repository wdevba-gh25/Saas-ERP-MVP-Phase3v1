# ERP-AI Gateway (FastAPI)

A very small Python service that your React ERP frontend can call directly.
It proxies to your existing **LLM_Client** service and generates a PDF for the
"Next Season Report" flow.

## Quickstart

```bash
# 1) Create venv
python -m venv .venv
source .venv/bin/activate   # on Windows: .venv\Scripts\activate

# 2) Install deps
pip install -r requirements.txt

# 3) Configure
cp .env.example .env
# Edit .env if your LLM_Client runs on a different port/host

# 4) Run
uvicorn app.main:app --host 0.0.0.0 --port 8009 --reload
```

Now your endpoints are available:

- `GET  /health`
- `POST /summarize`     → { summary }
- `POST /extract`       → { items: string[] }
- `POST /recommend`     → { title, summary, recommendations[], pdfUrl }

The generated PDFs are served at `/files/<name>.pdf`.
