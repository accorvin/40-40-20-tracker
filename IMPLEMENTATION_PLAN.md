# 40-40-20 Sprint Allocation Tracker — Implementation Plan

## Overview

A read-only web app that visualizes per-sprint allocation of scrum teams in the RHOAIENG Jira project against a 40-40-20 model:

- **40% — Bugs & Tech Debt**: Bug issue types + issues not categorized as feature work
- **40% — Feature Work**: Stories/Tasks that are children of Epics that are children of Features (in RHAISTRAT)
- **20% — Learning**: Excluded for now (shown as 0%, to be added later)

The app pulls data from a Jira Datacenter instance, caches transformed data in S3, and presents a dashboard grid of all scrum teams with drill-down into per-sprint detail.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vue 3 (Composition API, `<script setup>`) | Same patterns as jira-tracker-app |
| Build | Vite 6 | Dev server + production builds |
| Styling | Tailwind CSS 3 | Blue primary palette |
| Auth (Frontend) | Firebase (Google OAuth) | @redhat.com domain restriction |
| Backend | AWS Lambda (Express via aws-serverless-express) | Two Lambda functions |
| API Gateway | AWS API Gateway | CORS enabled, token validation |
| Infrastructure | AWS Amplify | Deployment + hosting |
| Storage | AWS S3 | Cached/transformed Jira data |
| Secrets | AWS SSM Parameter Store (prod) / `.env` (local dev) | Jira PAT |
| Testing | Vitest + @vue/test-utils | TDD approach, jsdom environment |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vue 3)                      │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ AuthGuard│  │ Dashboard    │  │ TeamDetail View        │ │
│  │          │  │ Grid View    │  │  - Sprint Selector     │ │
│  │          │  │  - Team Cards│  │  - Allocation Chart    │ │
│  │          │  │  - Summary   │  │  - Issue Lists         │ │
│  │          │  │    Stats     │  │  - Unestimated Panel   │ │
│  └──────────┘  └──────────────┘  └────────────────────────┘ │
│                         │                                    │
│                    src/services/api.js                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS (Bearer token)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway                               │
│                                                              │
│  GET /boards              - List boards for project          │
│  GET /boards/:id/sprints  - List sprints for a board         │
│  GET /sprints/:id/issues  - Get issues for a sprint          │
│  POST /refresh            - Fetch fresh data from Jira       │
│  GET /teams               - Get team/board config            │
│  POST /teams              - Save team/board config           │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐   ┌──────────────────┐
│  jiraFetcher     │   │  dataReader      │
│  Lambda          │   │  Lambda          │
│                  │   │                  │
│  - Fetch boards  │   │  - Read from S3  │
│  - Fetch sprints │   │  - Serve cached  │
│  - Fetch issues  │   │    data          │
│  - Classify      │   │  - Manage team   │
│    buckets       │   │    config        │
│  - Upload to S3  │   │                  │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
         ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│  Jira Datacenter │   │  S3 Bucket       │
│  API             │   │                  │
│  (issues.redhat  │   │  - boards.json   │
│   .com)          │   │  - sprints/      │
│                  │   │  - teams.json    │
└──────────────────┘   └──────────────────┘
```

---

## Project Structure

```
40-40-20-tracker/
├── src/
│   ├── components/
│   │   ├── App.vue                  # Root: routing between views
│   │   ├── AuthGuard.vue            # Firebase auth wrapper
│   │   ├── TopNav.vue               # Navigation bar + refresh button
│   │   ├── DashboardGrid.vue        # Grid of all team summary cards
│   │   ├── TeamCard.vue             # Summary card per team (current sprint)
│   │   ├── TeamDetail.vue           # Full sprint detail for one team
│   │   ├── SprintSelector.vue       # Dropdown/tabs for sprint selection
│   │   ├── AllocationBar.vue        # Horizontal stacked bar (40-40-20)
│   │   ├── BucketBreakdown.vue      # Detailed stats per bucket
│   │   ├── IssueList.vue            # Expandable list of issues
│   │   ├── UnestimatedPanel.vue     # Count + expandable list of unestimated issues
│   │   ├── SprintStatusBadge.vue    # Past / Active / Future badge
│   │   ├── CompletionSummary.vue    # Completed vs committed for past sprints
│   │   ├── LoadingOverlay.vue       # Full-screen loading spinner
│   │   └── Toast.vue                # Success/error notifications
│   ├── composables/
│   │   └── useAuth.js               # Firebase auth state & methods
│   ├── config/
│   │   └── firebase.js              # Firebase initialization
│   ├── services/
│   │   └── api.js                   # API client functions
│   ├── utils/
│   │   └── bucketClassifier.js      # Issue → bucket classification logic
│   ├── __tests__/                   # Test files (TDD)
│   ├── main.js                      # Vue app entry point
│   └── style.css                    # Tailwind imports + global styles
├── amplify/
│   └── backend/
│       ├── function/
│       │   ├── jiraFetcher/
│       │   │   └── src/
│       │   │       ├── app.js       # Express routes for Jira fetching
│       │   │       ├── jiraClient.js # Jira API wrapper
│       │   │       ├── classifier.js # Server-side bucket classification
│       │   │       ├── verifyToken.js # Firebase token verification
│       │   │       └── package.json
│       │   └── dataReader/
│       │       └── src/
│       │           ├── app.js       # Express routes for reading S3 data
│       │           └── package.json
│       └── api/
│           └── allocationApi/       # API Gateway config
├── public/
│   └── redhat-logo.svg
├── index.html
├── package.json
├── vite.config.js
├── vitest.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── CLAUDE.md
└── README.md
```

---

## Implementation Phases

### Phase 1: Project Scaffolding & Authentication

**Goal**: Bootable app with auth, no Jira integration yet.

#### Steps

1. **Initialize project**
   - `npm create vite@latest` with Vue template
   - Install dependencies: `vue`, `tailwindcss`, `postcss`, `autoprefixer`, `firebase`, `aws-amplify`
   - Install dev dependencies: `vitest`, `@vue/test-utils`, `jsdom`
   - Configure `vite.config.js`, `tailwind.config.js` (blue palette), `postcss.config.js`, `vitest.config.js`

2. **Set up Tailwind CSS**
   - Copy color palette config from jira-tracker-app
   - Create `style.css` with Tailwind directives

3. **Set up Firebase auth**
   - Create Firebase project (or reuse existing `ai-engineering-jira-tracking`)
   - Implement `src/config/firebase.js`
   - Implement `src/composables/useAuth.js` (same pattern: `user`, `loading`, `error` refs, `signIn`, `signOut`, `getIdToken`)
   - Implement `AuthGuard.vue` with loading, error, and unauthenticated states

4. **Create App shell**
   - `App.vue` with `AuthGuard` wrapper
   - `TopNav.vue` with app title, user display, sign-out button, refresh button (disabled for now)
   - Placeholder `DashboardGrid.vue`

5. **Write tests**
   - `AuthGuard.spec.js`: renders states correctly
   - `TopNav.spec.js`: displays user info, emits events

#### Deliverable
A running app at `localhost:5173` that authenticates with Google, shows a top nav, and displays an empty dashboard.

---

### Phase 2: AWS Backend Setup

**Goal**: Lambda functions and API Gateway deployed, reading/writing S3.

#### Steps

1. **Initialize Amplify**
   - `amplify init` with `ais` AWS profile
   - Add API: REST, API Gateway

2. **Create `jiraFetcher` Lambda**
   - Express app with `aws-serverless-express`
   - `verifyToken.js` middleware (Firebase token validation)
   - Jira PAT retrieval:
     - Check `process.env.JIRA_TOKEN` first (local dev via `.env`)
     - Fall back to SSM Parameter Store (production)
   - Endpoints:
     - `POST /refresh` — Triggers full data refresh from Jira (accepts `{ projectKey, boardIds }`)

3. **Create `dataReader` Lambda**
   - Express app with `aws-serverless-express`
   - `verifyToken.js` middleware
   - Endpoints:
     - `GET /boards` — Read cached boards list from S3
     - `GET /boards/:boardId/sprints` — Read cached sprints for a board from S3
     - `GET /sprints/:sprintId/issues` — Read cached issues for a sprint from S3
     - `GET /teams` — Read team configuration from S3
     - `POST /teams` — Save team configuration to S3

4. **Create S3 bucket**
   - Bucket: `40-40-20-tracker-data-dev`
   - IAM roles for Lambda access

5. **Set up `.env.example`**
   ```
   JIRA_TOKEN=your-personal-access-token
   JIRA_HOST=https://issues.redhat.com
   S3_BUCKET=40-40-20-tracker-data-dev
   ```

6. **Create frontend API service**
   - `src/services/api.js` with functions:
     - `refreshData(projectKey, boardIds)`
     - `getBoards()`
     - `getSprintsForBoard(boardId)`
     - `getSprintIssues(sprintId)`
     - `getTeams()` / `saveTeams(teams)`
   - All calls include `Authorization: Bearer {firebaseToken}` header

#### Deliverable
Deployed Lambda functions accessible via API Gateway. Frontend can call APIs (returns empty data for now).

---

### Phase 3: Jira Data Fetching & Caching

**Goal**: Fetch boards, sprints, and issues from Jira. Classify issues into buckets. Cache in S3.

#### Steps

1. **Implement `jiraClient.js`** (in jiraFetcher Lambda)
   - `fetchBoards(projectKey)` — `GET /rest/agile/1.0/board?projectKeyOrId={key}&type=scrum`
     - Paginate through all results
     - Return: `[{ id, name, projectKey }]`
   - `fetchSprints(boardId)` — `GET /rest/agile/1.0/board/{boardId}/sprint`
     - Paginate through results
     - Return: `[{ id, name, state, startDate, endDate, boardId }]`
     - `state` is one of: `future`, `active`, `closed`
   - `fetchSprintIssues(sprintId)` — `GET /rest/agile/1.0/sprint/{sprintId}/issue`
     - Paginate through results (maxResults=100)
     - Fields to request: `summary, issuetype, status, assignee, story_points (or customfield), sprint, resolution, resolutiondate`
     - Return raw issue data for transformation

2. **Implement feature work detection**
   - The JQL for identifying feature work children:
     ```
     issueFunction in linkedIssuesOf(
       "project = RHOAIENG AND issuetype = Epic AND issueFunction in linkedIssuesOf(
         'project = RHAISTRAT AND issuetype = Feature', 'is parent of'
       )",
       "is epic of"
     )
     ```
   - **Strategy**: On refresh, execute this JQL query separately to get the full set of feature-work issue keys
   - Store as a `Set<string>` of issue keys (e.g., `RHOAIENG-1234`)
   - When classifying sprint issues, check membership in this set

3. **Implement `classifier.js`** (in jiraFetcher Lambda)
   - `classifyIssue(issue, featureWorkKeys)`:
     - If `issue.issuetype === 'Bug'` → `bugs-tech-debt`
     - If `issue.key` is in `featureWorkKeys` Set → `feature-work`
     - Otherwise → `bugs-tech-debt` (default bucket; learning excluded for now)
   - Returns enriched issue object with `bucket` field

4. **Implement refresh flow** (`POST /refresh`)
   ```
   1. Authenticate request (Firebase token)
   2. Get Jira PAT (env var or SSM)
   3. Fetch all scrum boards for RHOAIENG
   4. For each board:
      a. Fetch all sprints
      b. For each sprint with state 'active' or 'closed' (last N closed):
         - Fetch all issues
   5. Execute feature-work JQL to get feature issue keys
   6. Classify all issues into buckets
   7. Transform and upload to S3:
      - boards.json: list of boards
      - sprints/{boardId}.json: sprints per board
      - issues/{sprintId}.json: classified issues per sprint
   8. Return summary
   ```

5. **Data model for cached sprint issues** (S3: `issues/{sprintId}.json`)
   ```json
   {
     "sprintId": 12345,
     "sprintName": "Team Alpha Sprint 42",
     "sprintState": "active",
     "startDate": "2026-02-03T00:00:00Z",
     "endDate": "2026-02-14T00:00:00Z",
     "boardId": 678,
     "lastUpdated": "2026-02-09T12:00:00Z",
     "issues": [
       {
         "key": "RHOAIENG-1234",
         "summary": "Fix login redirect bug",
         "issueType": "Bug",
         "status": "In Progress",
         "assignee": "user@redhat.com",
         "storyPoints": 3,
         "bucket": "bugs-tech-debt",
         "resolution": null,
         "completed": false,
         "url": "https://issues.redhat.com/browse/RHOAIENG-1234"
       }
     ],
     "summary": {
       "totalPoints": 34,
       "estimatedIssueCount": 12,
       "unestimatedIssueCount": 3,
       "buckets": {
         "bugs-tech-debt": { "points": 15, "issueCount": 5, "completedPoints": 8 },
         "feature-work": { "points": 19, "issueCount": 7, "completedPoints": 12 },
         "learning": { "points": 0, "issueCount": 0, "completedPoints": 0 }
       }
     }
   }
   ```

6. **Write tests**
   - `classifier.spec.js`: unit tests for bucket classification
   - `jiraClient.spec.js`: mock Jira API responses, verify pagination and transformation

#### Deliverable
`POST /refresh` fetches real data from Jira, classifies issues, and stores structured JSON in S3. Read endpoints serve cached data.

---

### Phase 4: Dashboard Grid View

**Goal**: Main landing page showing all teams with current sprint allocation summaries.

#### Steps

1. **Implement `DashboardGrid.vue`**
   - On mount: call `getBoards()` and `getTeams()` from API
   - Display a responsive CSS grid of `TeamCard` components
   - Loading state while fetching
   - Empty state if no boards/data

2. **Implement `TeamCard.vue`**
   - Props: `board`, `currentSprint`, `sprintSummary`
   - Display:
     - Team/board name
     - Current sprint name + `SprintStatusBadge` (active/future/closed)
     - `AllocationBar` showing 40-40-20 actual distribution
     - Total committed points
     - Unestimated issue count (warning badge if > 0)
     - For past sprints: completion percentage
   - Click handler: navigates to `TeamDetail` view

3. **Implement `AllocationBar.vue`**
   - Horizontal stacked bar chart (pure CSS/Tailwind, no chart library)
   - Three segments color-coded:
     - Bugs/Tech Debt: red/orange
     - Feature Work: blue
     - Learning: green (will show as empty for now)
   - Target lines at 40% and 80% marks
   - Percentage labels on each segment
   - Props: `buckets` object with points per bucket

4. **Implement `SprintStatusBadge.vue`**
   - Props: `state` ('active', 'closed', 'future')
   - Colored badge: green (active), gray (closed), blue (future)

5. **Implement view routing in `App.vue`**
   - Simple component-based routing (no vue-router, matching jira-tracker-app pattern)
   - Views: `dashboard` (default), `team-detail`
   - Track `currentView` and `selectedTeam` in App state

6. **Implement data loading in `App.vue`**
   - On mount: fetch boards and current sprint data for each board
   - Pass down to `DashboardGrid` as props
   - Refresh button in `TopNav` triggers `POST /refresh` then re-fetches

7. **Write tests**
   - `DashboardGrid.spec.js`: renders correct number of team cards
   - `TeamCard.spec.js`: displays allocation data correctly, emits click
   - `AllocationBar.spec.js`: renders segments with correct widths
   - `SprintStatusBadge.spec.js`: renders correct badge for each state

#### Deliverable
Dashboard showing all teams in a grid with allocation bars, point totals, and sprint status.

---

### Phase 5: Team Detail View

**Goal**: Drill-down view for a single team showing sprint-level allocation detail.

#### Steps

1. **Implement `SprintSelector.vue`**
   - Props: `sprints` (array of sprints for this board), `selectedSprintId`
   - Dropdown or horizontal scrollable list
   - Group by state: Active first, then Future, then Closed (most recent first)
   - Emit `select-sprint` event

2. **Implement `TeamDetail.vue`**
   - Props: `board`, `sprints`, `selectedSprint`, `sprintData`
   - Layout:
     ```
     ┌─────────────────────────────────────────────┐
     │ ← Back to Dashboard    Team Name            │
     │                                             │
     │ Sprint: [Sprint Selector Dropdown]          │
     │ Status: [Active Badge]  Feb 3 – Feb 14      │
     │                                             │
     │ ┌─────────────────────────────────────────┐ │
     │ │         Allocation Bar (large)          │ │
     │ └─────────────────────────────────────────┘ │
     │                                             │
     │ Total Committed: 34 pts                     │
     │ Unestimated Issues: 3 ⚠️ [expand]           │
     │                                             │
     │ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
     │ │ Bugs &   │ │ Feature  │ │ Learning │    │
     │ │ Tech Debt│ │ Work     │ │          │    │
     │ │          │ │          │ │          │    │
     │ │ 15 pts   │ │ 19 pts   │ │ 0 pts    │    │
     │ │ 44%      │ │ 56%      │ │ 0%       │    │
     │ │ Target:  │ │ Target:  │ │ Target:  │    │
     │ │ 40%      │ │ 40%      │ │ 20%      │    │
     │ │          │ │          │ │          │    │
     │ │ [issues] │ │ [issues] │ │ [issues] │    │
     │ └──────────┘ └──────────┘ └──────────┘    │
     │                                             │
     │ (Past sprint only:)                         │
     │ ┌─────────────────────────────────────────┐ │
     │ │ Completion: 28/34 pts (82%)             │ │
     │ │ Bugs: 8/15 (53%) | Features: 12/19..   │ │
     │ └─────────────────────────────────────────┘ │
     └─────────────────────────────────────────────┘
     ```

3. **Implement `BucketBreakdown.vue`**
   - Props: `bucket` (name, points, percentage, targetPercentage, issues, completedPoints)
   - Card layout showing:
     - Bucket name and color indicator
     - Points and percentage
     - Target percentage with over/under indicator
     - Expandable issue list

4. **Implement `IssueList.vue`**
   - Props: `issues` array, `expandable` (bool)
   - Collapsed by default, click to expand
   - Each issue row: key (linked to Jira), summary, points, status
   - Completed issues shown with strikethrough or green checkmark (past sprints)
   - Unestimated issues highlighted

5. **Implement `UnestimatedPanel.vue`**
   - Props: `issues` (filtered to unestimated only)
   - Shows count prominently
   - Expandable list of unestimated issue keys + summaries (linked to Jira)

6. **Implement `CompletionSummary.vue`**
   - Props: `sprintSummary` (from cached data)
   - Only renders when sprint state is `closed`
   - Shows: completed points / total points (percentage)
   - Per-bucket completion breakdown

7. **Wire up data flow**
   - `App.vue` passes board + sprints to `TeamDetail`
   - `TeamDetail` emits `select-sprint`, App fetches `getSprintIssues(sprintId)`
   - Sprint data passed back down as props

8. **Write tests**
   - `TeamDetail.spec.js`: renders all sections, handles sprint selection
   - `BucketBreakdown.spec.js`: correct percentage calculation, color coding
   - `IssueList.spec.js`: expand/collapse, issue rendering
   - `UnestimatedPanel.spec.js`: count display, list expansion
   - `CompletionSummary.spec.js`: only renders for closed sprints
   - `SprintSelector.spec.js`: groups sprints by state, emits selection

#### Deliverable
Full team detail view with sprint selection, allocation visualization, issue lists, and completion stats.

---

### Phase 6: Team Configuration

**Goal**: Allow configuring which boards map to which teams (naming, selection, ordering).

#### Steps

1. **Implement team config data model**
   - Stored in S3 as `teams.json`:
     ```json
     {
       "teams": [
         {
           "boardId": 678,
           "boardName": "RHOAIENG Board - Team Alpha",
           "displayName": "Team Alpha",
           "enabled": true
         }
       ]
     }
     ```
   - On first refresh, auto-generate from discovered boards
   - User can edit display names and enable/disable boards

2. **Implement team config UI**
   - Settings/config modal accessible from TopNav
   - List of discovered boards with:
     - Toggle to enable/disable (hide from dashboard)
     - Editable display name
   - Save button calls `POST /teams`

3. **Write tests**
   - Config modal renders boards, saves changes

#### Deliverable
Users can customize which boards appear on the dashboard and how they're labeled.

---

### Phase 7: Polish & Deployment

**Goal**: Production-ready app deployed via Amplify.

#### Steps

1. **Loading & error states**
   - `LoadingOverlay.vue` for full-page loads
   - Inline loading spinners for section-level loads
   - Error handling with user-friendly messages
   - Toast notifications for refresh success/failure

2. **Responsive design**
   - Dashboard grid: 1 column mobile, 2 columns tablet, 3-4 columns desktop
   - Team detail: stack buckets vertically on mobile

3. **localStorage persistence**
   - Remember last selected team
   - Remember last selected sprint per team

4. **Auto-refresh indicator**
   - Show "Last updated: X minutes ago" from cached data timestamp
   - Visual indicator when data is stale (> 1 hour old)

5. **Deploy**
   - `amplify init` with production environment
   - Configure SSM parameter for Jira token in production
   - `amplify publish` for full deployment
   - Set up Amplify Hosting with GitHub integration

6. **Documentation**
   - README with setup instructions, architecture overview, and deployment guide
   - `.env.example` with all configuration variables
   - CLAUDE.md with project-specific AI assistant instructions

#### Deliverable
Production-deployed app accessible via Amplify Hosting URL.

---

## Jira API Reference

All API calls target the Jira Datacenter REST API at `https://issues.redhat.com`.

### Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/rest/agile/1.0/board?projectKeyOrId=RHOAIENG&type=scrum` | GET | List scrum boards |
| `/rest/agile/1.0/board/{boardId}/sprint` | GET | List sprints for a board |
| `/rest/agile/1.0/sprint/{sprintId}/issue` | GET | Get issues in a sprint |
| `/rest/api/2/search?jql={jql}` | GET | Execute JQL for feature work detection |

### Authentication

- **Header**: `Authorization: Bearer {PAT}`
- **Token source (local)**: `process.env.JIRA_TOKEN` from `.env`
- **Token source (prod)**: AWS SSM Parameter Store at `/40-40-20-tracker/{env}/jira-token`

### Feature Work JQL

```jql
issueFunction in linkedIssuesOf(
  "project = RHOAIENG AND issuetype = Epic AND issueFunction in linkedIssuesOf(
    'project = RHAISTRAT AND issuetype = Feature',
    'is parent of'
  )",
  "is epic of"
)
```

This query returns all Stories/Tasks in RHOAIENG that are children of Epics that are children of Features in RHAISTRAT. The set of returned issue keys is used as a lookup for bucket classification.

### Story Points Field

The story points field name needs to be identified. Common options:
- Built-in: `story_points` (Jira Agile)
- Custom field: `customfield_XXXXX`

**Action item**: Verify the exact field name by inspecting a sample issue via the Jira API during Phase 3 implementation.

---

## Key Design Decisions

1. **Capacity = total story points**: No separate capacity configuration. A sprint's capacity is the sum of all estimated issues' story points.

2. **Default bucket is bugs/tech-debt**: Any issue that isn't positively identified as feature work goes into bugs/tech-debt. This ensures nothing falls through the cracks.

3. **Learning bucket deferred**: Shown in the UI as a bucket with 0 points. The infrastructure is in place to add classification logic later.

4. **Feature detection via JQL, not traversal**: Rather than recursively walking parent links per-issue, we execute a single JQL query to get all feature-work issue keys, then do a `Set.has()` lookup. This is more efficient and leverages Jira's own relationship resolution.

5. **Cached data in S3**: Same pattern as jira-tracker-app. Data is fetched on-demand (user clicks Refresh), transformed, and stored in S3. Read operations are fast S3 reads, not live Jira queries.

6. **No vue-router**: Simple component switching in App.vue, consistent with jira-tracker-app's approach.

7. **Firebase auth reuse**: Same Firebase project can be reused, maintaining the @redhat.com domain restriction.

---

## Future Enhancements (Out of Scope)

- **Learning bucket classification**: Add label/field-based detection when Jira tracking is established
- **Historical trends**: Chart allocation percentages over time across sprints
- **Alerts/notifications**: Warn when a team's allocation deviates significantly from 40-40-20
- **Cross-team comparison**: Side-by-side view of multiple teams' allocations
- **Sprint planning mode**: Suggest moves to balance allocation before sprint starts
- **Configurable bucket ratios**: Allow teams to set custom targets (e.g., 50-30-20)
- **Export/reporting**: PDF or CSV export of allocation data
