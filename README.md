# 40-40-20 Sprint Allocation Tracker

Web app for tracking per-sprint allocation of scrum teams against a 40-40-20 model:

- **Bugs & Tech Debt (40%)** — Bug issue types and anything not classified as feature work
- **Feature Work (40%)** — Stories/Tasks that are children of Epics that are children of Features
- **Learning (20%)** — Currently excluded (shown as 0%)

Data is pulled from Jira boards and cached in S3 for fast loading.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3, Vite, Tailwind CSS |
| Backend | AWS Lambda (Express via aws-serverless-express) |
| Auth | Firebase (Google OAuth, restricted to @redhat.com) |
| Storage | AWS S3 (cached Jira data) |
| Testing | Vitest + @vue/test-utils |

## Prerequisites

- Node.js 18+
- A Jira personal access token with read access to your boards
- A Firebase project with Google sign-in enabled
- (Production only) AWS account with S3 and Lambda configured via Amplify

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `JIRA_TOKEN` | Jira personal access token |
| `JIRA_HOST` | Jira instance URL (default: `https://issues.redhat.com`) |
| `VITE_FIREBASE_API_KEY` | Firebase web API key |

Optional variables:

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (has default) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID (has default) |
| `S3_BUCKET` | S3 bucket name (production only) |
| `VITE_API_ENDPOINT` | API base URL (defaults to `/api` proxy) |
| `API_PORT` | Local dev server port (default: `3001`) |

### 3. Run locally

Start both the Vite dev server and the local API server:

```bash
npm run dev:full
```

Or run them separately:

```bash
npm run dev          # Frontend (Vite)
npm run dev:server   # Backend API server
```

The Vite dev server proxies `/api` requests to the local backend on port 3001.

### 4. Run tests

```bash
npm test             # Run once
npm run test:watch   # Watch mode
```

## Project Structure

```
├── public/                     # Static assets
├── src/
│   ├── components/             # Vue components
│   │   ├── AllocationBar.vue       # Stacked percentage bar
│   │   ├── AuthGuard.vue           # Firebase auth gate
│   │   ├── BoardSettings.vue       # Board configuration
│   │   ├── BucketBreakdown.vue     # Per-bucket detail card
│   │   ├── CompletionSummary.vue   # Closed sprint completion stats
│   │   ├── DashboardGrid.vue       # Team card grid
│   │   ├── IssueList.vue           # Expandable issue list
│   │   ├── LoadingOverlay.vue      # Loading spinner overlay
│   │   ├── SprintSelector.vue      # Sprint dropdown selector
│   │   ├── SprintStatusBadge.vue   # Active/closed/future badge
│   │   ├── TeamCard.vue            # Dashboard summary card
│   │   ├── TeamDetail.vue          # Full team drill-down view
│   │   ├── Toast.vue               # Toast notifications
│   │   └── UnestimatedPanel.vue    # Unestimated issues warning
│   ├── composables/            # Vue composables
│   │   └── useAuth.js              # Firebase auth state
│   ├── config/                 # Configuration
│   │   └── firebase.js             # Firebase initialization
│   ├── services/               # API client
│   │   └── api.js                  # Backend API calls
│   ├── __tests__/              # Component tests (Vitest)
│   ├── App.vue                 # Root component
│   └── main.js                 # App entry point
├── server/                     # Local dev server
│   ├── dev-server.js               # Express API server
│   └── storage.js                  # Local file storage adapter
├── amplify/                    # AWS Amplify backend
│   └── backend/
│       ├── function/
│       │   ├── jiraFetcher/        # Lambda: Jira → S3
│       │   └── dataReader/         # Lambda: S3 → API
│       └── api/
│           └── allocationApi/      # API Gateway config
└── data/                       # Local dev data cache (gitignored)
```

## Views

### Dashboard

Grid of team cards showing each team's current sprint allocation as a stacked bar chart. Color-coded legend indicates Bugs & Tech Debt (amber), Feature Work (blue), and Learning (green). Cards show sprint name, total points, and allocation percentages.

### Team Detail

Drill-down view with:
- Sprint selector dropdown (grouped by active/future/closed)
- Allocation bar with hover tooltips
- Per-bucket breakdown cards with issue lists
- Unestimated issues warning panel
- Completion summary for closed sprints

## Architecture

```
Browser → Firebase Auth → Vue 3 SPA
                              ↓
                         API Gateway
                        ↙          ↘
               jiraFetcher      dataReader
              (Jira → S3)      (S3 → client)
```

- **jiraFetcher** pulls board, sprint, and issue data from Jira, classifies issues into buckets, and writes JSON to S3
- **dataReader** serves cached data from S3 to the frontend
- The local dev server (`server/dev-server.js`) combines both roles using the filesystem instead of S3

## Deployment

This project uses AWS Amplify for deployment. All AWS/Amplify CLI commands require SAML authentication:

```bash
rh-aws-saml-login iaps-rhods-odh-dev amplify push      # Deploy backend
rh-aws-saml-login iaps-rhods-odh-dev amplify publish    # Deploy frontend + backend
```

The Jira token is stored in AWS SSM Parameter Store at `/40-40-20-tracker/dev/jira-token`.

## License

Internal use.
