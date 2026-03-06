# CutCards

A full-stack web app for competitive debaters to cut cards from URLs.

## Stack
- Backend: FastAPI (Python)
- Frontend: React + Vite
- AI: Anthropic Claude (`claude-sonnet-4-20250514`)

## Quick Start

### 1) Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set ANTHROPIC_API_KEY in backend/.env or shell env
uvicorn main:app --reload --port 8000
```

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and calls backend at `http://localhost:8000` by default.

To override backend URL:
```bash
# frontend/.env
VITE_API_BASE=http://localhost:8000
```

## API Endpoints
- `POST /api/summary` - scrape URL + generate article summary
- `POST /api/quotes` - extract debate-relevant quotes with context/implication
- `POST /api/card` - generate credibility header, tag, cite, and auto-bolded quotes
- `POST /api/export` - export cut card as `.docx`

## Project Structure
```text
cutcards/
  backend/
    main.py
    scraper.py
    claude_service.py
    models.py
  frontend/
    src/
      App.jsx
      api.js
      components/
        UrlSubmit.jsx
        ArticleSummary.jsx
        QuoteExplorer.jsx
        CardBuilder.jsx
```
