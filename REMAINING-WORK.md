# Remaining Work: 40-40-20 Tracker Scaling

## Status Summary

| Phase | Status |
|-------|--------|
| Phase 0: Foundation (Config & S3 Key Namespacing) | Complete |
| Phase 1: Multi-Project Backend Support | Complete |
| Phase 2: Frontend Multi-Project Hierarchy | Complete |
| Phase 3: SQS Fan-Out Architecture | Code complete, deploy blocked |
| Phase 4: Historical Trends | Not started |
| Phase 5: Polish & Hardening | Not started |

Phases 0-2 committed as `bcc06f4`. Phase 3 code is on `main` but not yet deployed.

---

## Phase 3: Deploy to Production

All Phase 3 code is written and tested (322 tests passing, build succeeds). Two blockers remain before deploying.

### Blocker 1: IAM Permission for SQS

The deployment role (`585132637328-rhoai-dev`) lacks `sqs:*` permissions. The `amplify push` failed with `sqs:CreateQueue` permission denied and rolled back cleanly.

**Fix:** Add `sqs:*` to the IAM policy in `app-interface`:

File: `/users/acorvin/dev/app-interface/data/aws/rhoai-dev/policies/CustomDevPolicy.yml`

Add `sqs:*` to the allowed actions list, then submit an MR through the app-interface process.

### Blocker 2: Amplify Not Recognizing New Functions

`amplify status` does not show `scheduler` and `aggregator` as new functions, even though they are registered in `backend-config.json` and `team-provider-info.json`. Amplify Gen 1 may require `amplify add function` to be run interactively to properly register them in its internal state (`#current-cloud-backend/amplify-meta.json`).

**Possible approaches:**
1. Run `amplify add function` interactively for scheduler and aggregator, then replace the generated boilerplate with the custom code already written
2. Manually update the `#current-cloud-backend/amplify-meta.json` to include the new functions (risky)
3. Deploy the scheduler and aggregator as standalone CloudFormation stacks outside of Amplify (escape hatch from the plan)

### Deployment Steps (once blockers resolved)

**Phase A — Deploy with scheduler disabled:**
1. Ensure `scheduler/parameters.json` has `"CloudWatchRule": "NONE"` (currently set)
2. Run: `rh-aws-saml-login iaps-rhods-odh-dev -- amplify push --yes`
3. Verify in AWS Console:
   - SQS queues created (`4040tracker-board-refresh-prod`, `4040tracker-board-refresh-dlq-prod`)
   - jiraFetcher Lambda has SQS event source mapping
   - jiraFetcher Lambda has `ReservedConcurrentExecutions: 2`
   - scheduler and aggregator Lambdas exist
4. Copy the BoardRefreshQueue URL from CloudFormation outputs

**Phase B — Enable scheduler:**
1. Update `scheduler/parameters.json`: set `"boardRefreshQueueUrl"` to the actual queue URL
2. Update `scheduler/parameters.json`: set `"CloudWatchRule"` to `"cron(30 * * * ? *)"`
3. Run: `rh-aws-saml-login iaps-rhods-odh-dev -- amplify push --yes`
4. Verify scheduler runs at :30, boards process via SQS, aggregator runs at :50
5. Monitor DLQ — should remain empty

**Phase C — Remove jiraFetcher EventBridge fallback:**
Once the scheduler is confirmed working, remove the EventBridge schedule from `jiraFetcher-cloudformation-template.json`:
- Remove `ShouldCreateSchedule` condition
- Remove `ScheduledEventRule` and `ScheduledEventPermission` resources
- Deploy again

### Key Files for Phase 3

- `amplify/backend/function/jiraFetcher/jiraFetcher-cloudformation-template.json` — SQS queues, event source mapping, reserved concurrency
- `amplify/backend/function/jiraFetcher/src/index.js` — SQS event handler
- `amplify/backend/function/jiraFetcher/src/app.js` — `processSqsMessage()`, `enqueueBoardRefreshes()`, reduced retries
- `amplify/backend/function/scheduler/` — new Lambda, EventBridge cron, reads orgs.json + teams.json, sends SQS messages
- `amplify/backend/function/aggregator/` — new Lambda, EventBridge cron, recomputes project/org summaries

---

## Phase 4: Historical Trends

**Goal:** Persist completed sprint snapshots and show time-bucketed trend charts.

### 4.1 Persist historical snapshots

Modify `processBoard()` in `orchestration.js`:
- When a sprint is first seen as closed, write an immutable snapshot to `data/history/{projectKey}/{boardId}/{sprintId}.json`
- Snapshot contains summary data only (no individual issues)
- Never overwrite existing history files

### 4.2 Create trends module

New file: `shared/trends.js` + `shared/__tests__/trends.spec.js`

- `bucketSprintsByWeek(sprints)` — groups sprints by ISO calendar week
- `bucketSprintsByMonth(sprints)` — groups by calendar month
- `aggregateBucket(sprintsInBucket)` — averages allocation percentages

### 4.3 Add trends endpoint

Modify `dataReader/src/app.js`:
- `GET /trends/:projectKey?period=month&months=6`
- `GET /trends/org?period=month&months=6`
- Consider pre-computing trend summaries in the aggregator

### 4.4 Create TrendChart component

New file: `src/components/TrendChart.vue`

- Time periods on X axis, stacked bars showing allocation percentages
- Target lines at 40/40/20
- Period selector (weekly/monthly), range selector (3/6/12 months)
- Use Chart.js or CSS-based bars
- Integrate into OrgDashboard and ProjectDetail views

### Files
- **Create:** `shared/trends.js`, `shared/__tests__/trends.spec.js`, `src/components/TrendChart.vue`, `src/__tests__/TrendChart.spec.js`
- **Modify:** `shared/orchestration.js`, `dataReader/src/app.js`, `server/dev-server.js`, `src/services/api.js`, `src/components/OrgDashboard.vue`, `src/components/ProjectDetail.vue`

---

## Phase 5: Polish & Hardening

- CloudWatch alarm on DLQ depth > 0
- Staleness warning if org-summary older than 2 hours
- Org config management UI (add/remove projects in BoardSettings)
- Generalize board name prefix stripping for any project key
- Client-side caching of summary data
- Loading skeletons for cards

---

## Phase Dependencies

```
Phase 3 (deploy) ──── Phase 4 ──── Phase 5
```

Phase 4 depends on Phase 3 being deployed (needs per-board processing via SQS to write history snapshots). Phase 5 is polish that can happen incrementally.

---

## Reference

Full original plan: `.claude/plans/prancy-finding-lovelace.md`
