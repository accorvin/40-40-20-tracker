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
| `JIRA_HOST` | Jira instance URL (default: `https://redhat.atlassian.net`) |
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

## How Data Is Pulled from Jira

### Overview

The data pipeline runs in two phases: **board discovery** (which boards/teams exist) and **refresh** (fetching sprint and issue data for each board). Both phases use the Jira Agile and REST APIs and store results as JSON in S3 (or the local filesystem during development).

### Phase 1: Board Discovery

The `/discover-boards` endpoint triggers discovery for a given Jira project key (default: `RHOAIENG`):

1. **Fetch boards** — Queries `/rest/agile/1.0/board?projectKeyOrId={key}` for both `scrum` and `kanban` board types. Results are paginated (50 per page).
2. **Check staleness** — For each scrum board, fetches its sprints and determines whether the board is stale. A board is stale if it has no active/future sprints and its most recent closed sprint ended more than 90 days ago. Kanban boards are never marked stale.
3. **Merge team config** — Discovered boards are merged with the existing `teams.json` config. Existing entries preserve their `enabled`, `displayName`, `sprintFilter`, and `calculationMode` settings. New scrum boards default to enabled (unless stale); new kanban boards default to disabled. Stale boards that were not manually configured are auto-disabled.

### Phase 2: Data Refresh

The `/refresh` endpoint triggers a full data refresh. In production this fans out via SQS (one message per board for parallel processing); locally it runs sequentially.

#### Scrum boards

For each enabled scrum board:

1. **Fetch sprints** — Queries `/rest/agile/1.0/board/{boardId}/sprint` (paginated). If the team has a `sprintFilter` configured, only sprints whose name contains the filter string are kept.
2. **Select sprints to process** — All active sprints, all future sprints, and the 5 most recent closed sprints are processed.
3. **Closed-sprint caching** — Closed sprints that already have cached data in storage are skipped (unless `hardRefresh` is true), since their data is immutable.
4. **Fetch issues** — For each sprint, queries `/rest/agile/1.0/sprint/{sprintId}/issue` (paginated, 100 per page). Fields fetched: `summary`, `issuetype`, `status`, `assignee`, `customfield_10028` (story points), `customfield_10464` (Activity Type), `resolution`, `resolutiondate`.
5. **Filter issue types** — Only `Bug`, `Task`, `Story`, `Spike`, `Vulnerability`, and `Weakness` issue types are kept. Sub-tasks, Epics, Initiatives, and other meta-level types are excluded.
6. **Classify and store** — Each issue is classified into a bucket (see below), marked as completed or not based on its resolution status, and the full sprint data (issues + summary) is written to storage.

#### Kanban boards

For each enabled kanban board:

1. **Get board filter** — Fetches the board's saved filter via `/rest/agile/1.0/board/{boardId}/configuration`.
2. **Build JQL** — Takes the filter's base JQL and constrains it to issues resolved in the last 2 weeks: `({baseJql}) AND resolved >= -2w ORDER BY resolved DESC`.
3. **Fetch, filter, classify** — Issues are fetched via `POST /rest/api/3/search/jql`, then filtered and classified the same way as scrum boards.
4. **Synthetic sprint** — A synthetic "Last 2 weeks" sprint is created since kanban boards don't have real sprints.

#### Dashboard summary

After all boards are processed, a `dashboard-summary.json` is generated containing the active sprint summary for each team. This powers the main dashboard grid without requiring per-team API calls.

### Jira Custom Fields

| Custom Field ID | Name | Usage |
|----------------|------|-------|
| `customfield_10028` | Story Points | Used for point-based allocation calculations |
| `customfield_10464` | Activity Type | Determines which 40-40-20 bucket an issue belongs to |

## How Per-Team Metrics Are Calculated

### Bucket Classification

Every issue is classified into one of four buckets based on its **Activity Type** custom field value:

| Activity Type Value | Bucket | Target |
|--------------------|--------|--------|
| `Tech Debt & Quality` | tech-debt-quality | 40% |
| `New Features` | new-features | 40% |
| `Learning & Enablement` | learning-enablement | 20% |
| _(missing or unrecognized)_ | uncategorized | — |

### Calculation Modes

Each team can be configured with a calculation mode:

- **`points`** (default) — Allocation percentages are based on story point totals. Issues without story points are counted as "unestimated" and flagged in the UI but do not contribute to percentage calculations.
- **`counts`** — Allocation percentages are based on raw issue counts, regardless of story points. Useful for teams that don't estimate.

### Sprint Summary

For each sprint, a summary is computed with:

- **Per-bucket totals** — Points, issue count, completed points, and completed count for each bucket
- **Overall totals** — Total points, total issue count, estimated vs. unestimated issue counts
- **Completion stats** — For closed sprints, completed points/counts per bucket enable completion rate calculations

### Rollup Summaries

Summaries aggregate upward through three levels:

1. **Sprint** — Per-sprint, per-team summary (described above)
2. **Project** — Aggregates across all enabled boards in a project. Uses weighted percentages: each board's contribution to the overall percentage is weighted by its total points (or total count if using `counts` mode), so larger sprints have proportionally more influence.
3. **Org** — Aggregates across all projects. Written to `data/org-summary.json`.

### Multi-Project Support

Data for each project is namespaced under `data/{PROJECT_KEY}/` in storage, keeping boards, teams, sprints, and dashboard summaries isolated. The org-level summary rolls up across all configured projects.

## Deployment

This project uses AWS Amplify for deployment. All AWS/Amplify CLI commands require SAML authentication:

```bash
rh-aws-saml-login iaps-rhods-odh-dev amplify push      # Deploy backend
rh-aws-saml-login iaps-rhods-odh-dev amplify publish    # Deploy frontend + backend
```

The Jira token is stored in AWS SSM Parameter Store at `/jira-tracker-app/dev/jira-token`.

## License

Internal use.
