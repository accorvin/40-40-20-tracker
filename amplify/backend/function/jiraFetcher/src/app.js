/**
 * Jira Fetcher Lambda
 * Fetches boards, sprints, and issues from Jira Datacenter API.
 * Classifies issues into 40-40-20 buckets.
 * Uploads transformed data to S3.
 *
 * Requires Firebase authentication token with @redhat.com domain.
 */

const express = require('express');
const bodyParser = require('body-parser');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const fetch = require('node-fetch');
const { verifyFirebaseToken } = require('./verifyToken');

const app = express();
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// Enable CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

// AWS Clients
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

const S3_BUCKET = process.env.S3_BUCKET;
const JIRA_HOST = process.env.JIRA_HOST || 'https://issues.redhat.com';
const JIRA_TOKEN_PARAMETER_NAME = process.env.JIRA_TOKEN_PARAMETER_NAME || '/40-40-20-tracker/dev/jira-token';

// Cache Jira token in memory
let cachedJiraToken = null;

/**
 * Get Jira API token from environment variable or SSM Parameter Store
 */
async function getJiraToken() {
  // Check environment variable first (local dev)
  if (process.env.JIRA_TOKEN) {
    return process.env.JIRA_TOKEN;
  }

  // Use cached token if available
  if (cachedJiraToken) {
    return cachedJiraToken;
  }

  // Fetch from SSM Parameter Store (production)
  try {
    const command = new GetParameterCommand({
      Name: JIRA_TOKEN_PARAMETER_NAME,
      WithDecryption: true
    });

    const response = await ssmClient.send(command);
    cachedJiraToken = response.Parameter.Value;
    return cachedJiraToken;
  } catch (error) {
    console.error('Failed to get Jira token from SSM:', error);
    throw new Error('Failed to retrieve Jira API token');
  }
}

/**
 * Make authenticated request to Jira API
 */
async function jiraRequest(path) {
  const token = await getJiraToken();
  const url = `${JIRA_HOST}${path}`;

  console.log(`[Jira API] GET ${url}`);
  const startTime = Date.now();

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    const text = await response.text();
    console.error(`[Jira API] FAILED ${response.status} ${url} (${elapsed}ms)`);
    throw new Error(`Jira API error (${response.status}): ${text}`);
  }

  console.log(`[Jira API] OK ${response.status} ${url} (${elapsed}ms)`);
  return response.json();
}

/**
 * Fetch all scrum boards for a project (paginated)
 */
async function fetchBoards(projectKey) {
  const boards = [];
  let startAt = 0;
  const maxResults = 50;
  let isLast = false;

  while (!isLast) {
    const data = await jiraRequest(
      `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=scrum&startAt=${startAt}&maxResults=${maxResults}`
    );

    boards.push(...data.values.map(board => ({
      id: board.id,
      name: board.name,
      projectKey: projectKey
    })));

    isLast = data.isLast;
    startAt += maxResults;
  }

  return boards;
}

/**
 * Fetch all sprints for a board (paginated)
 */
async function fetchSprints(boardId) {
  const sprints = [];
  let startAt = 0;
  const maxResults = 50;
  let isLast = false;

  while (!isLast) {
    const data = await jiraRequest(
      `/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=${maxResults}`
    );

    sprints.push(...data.values.map(sprint => ({
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      startDate: sprint.startDate || null,
      endDate: sprint.endDate || null,
      completeDate: sprint.completeDate || null,
      boardId: boardId
    })));

    isLast = data.isLast;
    startAt += maxResults;
  }

  return sprints;
}

/**
 * Fetch all issues for a sprint (paginated)
 */
async function fetchSprintIssues(sprintId) {
  const issues = [];
  let startAt = 0;
  const maxResults = 100;
  let total = Infinity;

  while (startAt < total) {
    const data = await jiraRequest(
      `/rest/agile/1.0/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=${maxResults}&fields=summary,issuetype,status,assignee,customfield_12310243,customfield_12320040,resolution,resolutiondate`
    );

    total = data.total;

    issues.push(...data.issues.map(issue => {
      const storyPoints = issue.fields.customfield_12310243 ?? null;

      return {
        key: issue.key,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype?.name || null,
        status: issue.fields.status?.name || null,
        assignee: issue.fields.assignee?.displayName || null,
        storyPoints: storyPoints,
        activityType: issue.fields.customfield_12320040?.value || null,
        resolution: issue.fields.resolution?.name || null,
        resolutionDate: issue.fields.resolutiondate || null,
        url: `${JIRA_HOST}/browse/${issue.key}`
      };
    }));

    startAt += maxResults;
  }

  return issues;
}

/**
 * Classify an issue into a 40-40-20 bucket based on Activity Type custom field
 */
function classifyIssue(issue) {
  switch (issue.activityType) {
    case 'Tech Debt & Quality':
      return 'tech-debt-quality';
    case 'New Features':
      return 'new-features';
    case 'Learning & Enablement':
      return 'learning-enablement';
    default:
      return 'uncategorized';
  }
}

/**
 * Staleness threshold: 90 days in milliseconds
 */
const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Find the most recent end date among a list of sprints.
 * Prefers completeDate for closed sprints, falls back to endDate.
 * @param {Array} sprints
 * @returns {string|null} ISO date string or null
 */
function getLatestSprintEndDate(sprints) {
  let latest = null;

  for (const sprint of sprints) {
    const dateStr = sprint.completeDate || sprint.endDate;
    if (!dateStr) continue;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    if (!latest || date > new Date(latest)) {
      latest = dateStr;
    }
  }

  return latest;
}

/**
 * Determine whether a board is stale based on its sprints.
 *
 * A board is stale if:
 * - It has no sprints at all, OR
 * - It has no active/future sprints AND its most recent closed sprint
 *   ended more than 3 months ago.
 *
 * @param {Array} sprints - Sprint objects with state, completeDate, endDate
 * @param {Date} [now=new Date()] - Current date (injectable for testing)
 * @returns {{ stale: boolean, lastSprintEndDate: string|null }}
 */
function determineStaleness(sprints, now = new Date()) {
  if (!sprints || sprints.length === 0) {
    return { stale: true, lastSprintEndDate: null };
  }

  const hasActiveOrFuture = sprints.some(
    s => s.state === 'active' || s.state === 'future'
  );

  if (hasActiveOrFuture) {
    return { stale: false, lastSprintEndDate: getLatestSprintEndDate(sprints) };
  }

  const lastSprintEndDate = getLatestSprintEndDate(sprints);

  if (!lastSprintEndDate) {
    return { stale: true, lastSprintEndDate: null };
  }

  const elapsed = now.getTime() - new Date(lastSprintEndDate).getTime();
  return { stale: elapsed > STALE_THRESHOLD_MS, lastSprintEndDate };
}

/**
 * Build sprint summary from classified issues
 */
function buildSprintSummary(issues) {
  const buckets = {
    'tech-debt-quality': { points: 0, issueCount: 0, completedPoints: 0 },
    'new-features': { points: 0, issueCount: 0, completedPoints: 0 },
    'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
    'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
  };

  let totalPoints = 0;
  let estimatedIssueCount = 0;
  let unestimatedIssueCount = 0;

  issues.forEach(issue => {
    const bucket = buckets[issue.bucket];
    if (!bucket) return;

    bucket.issueCount++;

    if (issue.storyPoints != null) {
      bucket.points += issue.storyPoints;
      totalPoints += issue.storyPoints;
      estimatedIssueCount++;

      if (issue.completed) {
        bucket.completedPoints += issue.storyPoints;
      }
    } else {
      unestimatedIssueCount++;
    }
  });

  return {
    totalPoints,
    estimatedIssueCount,
    unestimatedIssueCount,
    buckets
  };
}

/**
 * Upload JSON to S3
 */
async function uploadToS3(key, data) {
  if (!S3_BUCKET) {
    throw new Error('S3_BUCKET environment variable is not set');
  }

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  });

  await s3Client.send(command);
  console.log(`Uploaded ${key} to S3`);
}

/**
 * Read JSON from S3
 */
async function readFromS3(key) {
  if (!S3_BUCKET) {
    throw new Error('S3_BUCKET environment variable is not set');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });

    const response = await s3Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * POST /discover-boards - Fetch boards from Jira and save to S3 without processing sprints
 */
app.post('/discover-boards', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const projectKey = req.body.projectKey || 'RHOAIENG';

    console.log(`Discovering boards for project ${projectKey} (user: ${verification.email})`);

    const boards = await fetchBoards(projectKey);
    console.log(`Found ${boards.length} scrum boards`);

    await uploadToS3('boards.json', {
      lastUpdated: new Date().toISOString(),
      boards: boards
    });

    // Fetch sprints for each board to determine staleness (concurrency of 10)
    const DISCOVER_CONCURRENCY = 10;
    const boardStaleness = new Map();

    for (let i = 0; i < boards.length; i += DISCOVER_CONCURRENCY) {
      const chunk = boards.slice(i, i + DISCOVER_CONCURRENCY);
      const results = await Promise.all(chunk.map(async (board) => {
        try {
          const sprints = await fetchSprints(board.id);
          return { boardId: board.id, ...determineStaleness(sprints) };
        } catch (error) {
          console.warn(`Failed to fetch sprints for board ${board.id}, marking as not stale:`, error.message);
          return { boardId: board.id, stale: false, lastSprintEndDate: null };
        }
      }));
      results.forEach(r => boardStaleness.set(r.boardId, r));
    }

    const staleCount = [...boardStaleness.values()].filter(s => s.stale).length;
    console.log(`Staleness check: ${staleCount} of ${boards.length} boards are stale`);

    // Merge with existing teams config (preserve enabled/disabled state + manual overrides)
    const existingTeams = await readFromS3('teams.json');
    const existingMap = existingTeams?.teams
      ? new Map(existingTeams.teams.map(t => [t.boardId, t]))
      : new Map();

    const mergedTeams = boards.map(b => {
      const staleness = boardStaleness.get(b.id) || { stale: false, lastSprintEndDate: null };
      const existing = existingMap.get(b.id);

      if (existing) {
        // Existing board: update staleness fields, auto-disable only if stale and not manually configured
        const updated = {
          ...existing,
          boardName: b.name,
          stale: staleness.stale,
          lastSprintEndDate: staleness.lastSprintEndDate
        };
        if (staleness.stale && !existing.manuallyConfigured) {
          updated.enabled = false;
        }
        return updated;
      }

      // New board: auto-set enabled based on staleness
      return {
        boardId: b.id,
        boardName: b.name,
        displayName: b.name.replace(/^RHOAIENG\s*[-–]\s*/, ''),
        enabled: !staleness.stale,
        stale: staleness.stale,
        lastSprintEndDate: staleness.lastSprintEndDate,
        manuallyConfigured: false
      };
    });

    await uploadToS3('teams.json', { teams: mergedTeams });

    res.json({ success: true, boardCount: boards.length, staleCount });
  } catch (error) {
    console.error('Discover boards error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Perform the actual refresh work. Called from both Express handler (via async
 * self-invocation) and direct Lambda invocation.
 */
async function performRefresh({ projectKey, hardRefresh }) {
  console.log(`Starting refresh for project ${projectKey} (hardRefresh: ${hardRefresh})`);
  const refreshStart = Date.now();

  // Step 1: Fetch all scrum boards
  console.log('Fetching boards...');
  const allBoards = await fetchBoards(projectKey);
  console.log(`Found ${allBoards.length} scrum boards`);

  // Filter to enabled boards only
  const teamsData = await readFromS3('teams.json');
  let boards = allBoards;
  if (teamsData && teamsData.teams) {
    const teamMap = new Map(teamsData.teams.map(t => [t.boardId, t]));
    boards = allBoards.filter(b => {
      const team = teamMap.get(b.id);
      return !team || team.enabled !== false;
    });
    const skipped = allBoards.length - boards.length;
    if (skipped > 0) {
      console.log(`Skipping ${skipped} disabled boards`);
    }
  }

  // Step 2: Process boards in parallel (concurrency of 5)
  const CONCURRENCY = 5;
  const boardResults = [];

  for (let i = 0; i < boards.length; i += CONCURRENCY) {
    const chunk = boards.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async (board) => {
      console.log(`Processing board: ${board.name} (${board.id})`);

      const sprints = await fetchSprints(board.id);
      console.log(`  [${board.name}] Found ${sprints.length} sprints`);

      const activeSprints = sprints.filter(s => s.state === 'active');
      const futureSprints = sprints.filter(s => s.state === 'future');
      const closedSprints = sprints
        .filter(s => s.state === 'closed')
        .sort((a, b) => new Date(b.completeDate || 0) - new Date(a.completeDate || 0))
        .slice(0, 5);

      const sprintsToProcess = [...activeSprints, ...futureSprints, ...closedSprints];
      const sprintResults = [];

      for (const sprint of sprintsToProcess) {
        // Closed-sprint caching: skip Jira fetch if cached and not hard refresh
        if (!hardRefresh && sprint.state === 'closed') {
          const cached = await readFromS3(`sprints/${sprint.id}.json`);
          if (cached) {
            console.log(`  [${board.name}] Using cached data for closed sprint: ${sprint.name}`);
            sprintResults.push({
              sprintId: sprint.id,
              sprintName: sprint.name,
              state: sprint.state,
              issueCount: cached.issues?.length || 0,
              totalPoints: cached.summary?.totalPoints || 0,
              summary: cached.summary
            });
            continue;
          }
        }

        console.log(`  [${board.name}] Fetching sprint: ${sprint.name} (${sprint.state})`);

        const rawIssues = await fetchSprintIssues(sprint.id);

        const classifiedIssues = rawIssues.map(issue => ({
          ...issue,
          bucket: classifyIssue(issue),
          completed: issue.resolution != null
        }));

        const summary = buildSprintSummary(classifiedIssues);

        console.log(`    ${classifiedIssues.length} issues, ${summary.totalPoints} pts | tech-debt: ${summary.buckets['tech-debt-quality'].points} pts, features: ${summary.buckets['new-features'].points} pts, learning: ${summary.buckets['learning-enablement'].points} pts, uncategorized: ${summary.buckets['uncategorized'].points} pts | ${summary.unestimatedIssueCount} unestimated`);

        const sprintData = {
          sprintId: sprint.id,
          sprintName: sprint.name,
          sprintState: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          completeDate: sprint.completeDate,
          boardId: board.id,
          lastUpdated: new Date().toISOString(),
          issues: classifiedIssues,
          summary
        };

        await uploadToS3(`sprints/${sprint.id}.json`, sprintData);

        sprintResults.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          state: sprint.state,
          issueCount: classifiedIssues.length,
          totalPoints: summary.totalPoints,
          summary
        });
      }

      // Upload sprints index for this board
      await uploadToS3(`sprints/board-${board.id}.json`, {
        boardId: board.id,
        boardName: board.name,
        lastUpdated: new Date().toISOString(),
        sprints: sprintsToProcess.map(s => ({
          id: s.id,
          name: s.name,
          state: s.state,
          startDate: s.startDate,
          endDate: s.endDate,
          completeDate: s.completeDate
        }))
      });

      // Pick the active sprint (or most recent closed) for dashboard summary
      const dashboardSprint = activeSprints[0] || closedSprints[0] || null;
      const dashboardSprintResult = dashboardSprint
        ? sprintResults.find(r => r.sprintId === dashboardSprint.id)
        : null;

      return {
        board,
        sprintResults,
        dashboardSprint,
        dashboardSprintResult
      };
    }));

    boardResults.push(...chunkResults);
  }

  // Step 3: Upload boards index
  await uploadToS3('boards.json', {
    lastUpdated: new Date().toISOString(),
    boards: allBoards
  });

  // Step 4: Upload teams config if it doesn't exist
  const existingTeams = await readFromS3('teams.json');
  if (!existingTeams) {
    await uploadToS3('teams.json', {
      teams: allBoards.map(b => ({
        boardId: b.id,
        boardName: b.name,
        displayName: b.name.replace(/^RHOAIENG\s*[-–]\s*/, ''),
        enabled: true
      }))
    });
  }

  // Step 5: Generate dashboard-summary.json
  const dashboardSummary = {
    lastUpdated: new Date().toISOString(),
    boards: {}
  };

  for (const { board, dashboardSprint, dashboardSprintResult } of boardResults) {
    if (dashboardSprint && dashboardSprintResult) {
      dashboardSummary.boards[board.id] = {
        sprint: {
          id: dashboardSprint.id,
          name: dashboardSprint.name,
          state: dashboardSprint.state,
          startDate: dashboardSprint.startDate,
          endDate: dashboardSprint.endDate
        },
        summary: dashboardSprintResult.summary
      };
    }
  }

  await uploadToS3('dashboard-summary.json', dashboardSummary);

  const allSprintResults = boardResults.flatMap(r => r.sprintResults);
  const refreshElapsed = ((Date.now() - refreshStart) / 1000).toFixed(1);
  console.log(`Refresh complete: ${boards.length} boards, ${allSprintResults.length} sprints (${refreshElapsed}s)`);

  return {
    success: true,
    projectKey,
    boardCount: boards.length,
    sprintCount: allSprintResults.length
  };
}

/**
 * POST /refresh - Kick off async refresh via Lambda self-invocation
 */
app.post('/refresh', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const projectKey = req.body.projectKey || 'RHOAIENG';
    const hardRefresh = req.body.hardRefresh || false;

    console.log(`Refresh requested by ${verification.email} (hardRefresh: ${hardRefresh})`);

    // Invoke self asynchronously
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (functionName) {
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: JSON.stringify({
          action: 'refresh',
          projectKey,
          hardRefresh
        })
      });
      await lambdaClient.send(command);
      console.log('Async refresh invocation sent');
    } else {
      // Fallback for local testing via Lambda
      setImmediate(() => {
        performRefresh({ projectKey, hardRefresh }).catch(error => {
          console.error('Background refresh error:', error);
        });
      });
    }

    res.json({ status: 'started' });

  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle OPTIONS for CORS preflight
app.options('/refresh', function(req, res) {
  res.status(200).end();
});

app.options('/discover-boards', function(req, res) {
  res.status(200).end();
});

app.listen(3000, function() {
  console.log("jiraFetcher app started");
});

module.exports = app;
module.exports.performRefresh = performRefresh;
module.exports.determineStaleness = determineStaleness;
