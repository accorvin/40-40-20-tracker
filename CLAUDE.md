# 40-40-20 Sprint Allocation Tracker

Web app for tracking per-sprint allocation of scrum teams against a 40-40-20 model (bugs/tech-debt, feature work, learning).

## Tech Stack
- **Frontend:** Vue 3 (Composition API with `<script setup>`), Vite, Tailwind CSS
- **Backend:** AWS Lambda (Express via aws-serverless-express)
- **Auth:** Firebase (Google OAuth, @redhat.com restriction)
- **Storage:** AWS S3 (cached Jira data)
- **Testing:** Vitest + @vue/test-utils

## Development Workflow

### Test-Driven Development (TDD)
This project follows strict TDD practices:
1. Write tests BEFORE implementing functionality
2. Run tests to confirm they fail
3. Implement the minimum code to make tests pass
4. Refactor if needed, ensuring tests still pass

### Running Tests

```bash
npm run test        # Run once
npm run test:watch  # Watch mode during development
```

### Running the App

```bash
npm run dev
```

### AWS CLI Commands

**IMPORTANT:** Always prepend AWS and Amplify CLI commands with `AWS_PROFILE=ais`

Examples:
```bash
AWS_PROFILE=ais aws ssm get-parameter --name /40-40-20-tracker/dev/jira-token
AWS_PROFILE=ais amplify push
AWS_PROFILE=ais amplify publish
```

## Project Structure
```
├── public/
│   └── redhat-logo.svg
├── src/
│   ├── components/         # Vue components
│   ├── composables/        # Vue composables (useAuth.js)
│   ├── config/             # Configuration (firebase.js)
│   ├── services/           # API client (api.js)
│   ├── utils/              # Utility functions
│   ├── __tests__/          # Component tests
│   ├── App.vue
│   └── main.js
├── amplify/
│   └── backend/
│       ├── function/
│       │   ├── jiraFetcher/    # Lambda: Fetch from Jira -> S3
│       │   └── dataReader/     # Lambda: Read from S3
│       └── api/
│           └── allocationApi/  # API Gateway configuration
```

## Key Patterns

### 40-40-20 Bucket Classification
- **Bugs & Tech Debt (40%):** Bug issue types + anything not categorized as feature work
- **Feature Work (40%):** Stories/Tasks that are children of Epics that are children of Features
- **Learning (20%):** Excluded for now (shown as 0%)

### Jira Configuration
- Host: `https://issues.redhat.com`
- Project: RHOAIENG (boards), RHAISTRAT (features for parent hierarchy)
- Token: `.env` for local dev, AWS SSM Parameter Store for production
- Issue URL pattern: `https://issues.redhat.com/browse/{KEY}`

### Views
- **Dashboard:** Grid of all team summary cards showing current sprint allocation
- **Team Detail:** Drill-down view with sprint selector and detailed allocation breakdown

## Testing Conventions

- Test files: `src/__tests__/<ComponentName>.spec.js`
- Use `@vue/test-utils` for component mounting
- Test component rendering, props, events, and user interactions

## Commit Messages
Use Conventional Commits format:
```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`
Scopes: `dashboard`, `detail`, `auth`, `api`, `fetcher`, `config`

## Styling
- Blue primary color theme
- Tailwind CSS utility classes
- Red Hat logo in header
