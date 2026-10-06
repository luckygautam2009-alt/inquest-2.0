# INQUEST — AI Complaint Investigation & Intelligent Handoff System

> **Team**: Code-Crusaders | Noda Institute of Engineering and Technology

INQUEST is an AI-powered complaint resolution system where every customer complaint is autonomously investigated against evidence (orders, payments, tickets, return policies) before deciding whether to auto-resolve, ask the customer for confirmation, or escalate to a human with full contextual intelligence.

---

##  Vision

To become the most intelligent, automated, and seamless complaint resolution platform that bridges the gap between AI-driven investigation and human expertise. INQUEST aims to drastically reduce manual handling time, ensure consistent investigative rigor, and provide customers with clear, timely resolutions — while empowering human agents with full context when intervention is needed.

---

##  Features

- **Autonomous Investigation**: AI-powered analysis of complaints against orders, payments, tickets, and return policies
- **Auto-Resolution**: Smart auto-resolution of straightforward complaints based on evidence
- **Customer Confirmation Flow**: Controlled handoff requiring customer confirmation for partial or uncertain resolutions
- **Escalation to Humans**: Intelligent escalation to human agents with full contextual intelligence when needed
- **Persistent Notifications**: System notifications that persist until acknowledged, ensuring no inquiry is missed
- **Image Validation**: Automatic image analysis and damage assessment for relevant complaints
- **Customer Account Management**: Secure signup, login, and session management with customer ID bound to authentication tokens
- **Admin Dashboard**: Full-featured admin panel for monitoring investigations, overriding decisions, and managing cases
- **Audit Logging**: Comprehensive audit trails for all complaint actions, customer responses, and decision flows
- **Risk Engine**: Automated risk assessment for each complaint based on multiple factors
- **Root Cause Engine**: Deep analysis to identify root causes behind complaints
- **Decision Engine**: Centralized decision-making pipeline that determines the best resolution path
- **Investigation Runner**: Automated investigation execution with gated flows and needs-information requests
- **CORS & Security**: Secure origin validation and rate limiting to protect the API
- **Rate Limiting**: Configurable rate limiting to prevent API abuse
- **Spa Redirects**: Single-page application routing support for seamless frontend navigation

---

##  Project Architecture

```
Inquest/
├── inquest-backend/     # Node.js + Express + Google Gemini API pipeline
│   ├── src/
│   │   ├── config/      # Environment & configuration
│   │   ├── controllers/ # Request handlers
│   │   ├── middleware/  # Security, rate-limiting, error handling
│   │   ├── mockData/    # Mock customers, orders, policies
│   │   ├── routes/      # REST API endpoints
│   │   ├── services/    # Engines: Intent, Root Cause, Decision, Handoff
│   │   └── utils/
│   └── package.json
│
└── inquest-frontend/    # React 19 + Vite + Tailwind CSS + React Flow UI
    ├── src/
    │   ├── api/         # Backend API client
    │   ├── components/  # Evidence graph, handoff cards, status indicators
    │   └── ...
    └── package.json
```

---

##  Quick Start

### 1. Backend Setup

```bash
cd inquest-backend
npm install
cp .env.example .env    # Configure your GEMINI_API_KEY
npm run dev
```

Backend will run on [http://localhost:5001](http://localhost:5001).

### 2. Frontend Setup

```bash
cd inquest-frontend
npm install
npm run dev
```

Frontend will run on [http://localhost:5173](http://localhost:5173).

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, ReactFlow
- **Backend**: Node.js, Express, Helmet, CORS, Express Rate Limit
- **AI / LLM**: Google Gemini API (`@google/generative-ai`)
