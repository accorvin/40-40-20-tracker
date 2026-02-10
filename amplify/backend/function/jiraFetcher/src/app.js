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
      `/rest/agile/1.0/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=${maxResults}&fields=summary,issuetype,status,assignee,story_points,customfield_10004,resolution,resolutiondate`
    );

    total = data.total;

    issues.push(...data.issues.map(issue => {
      // Try multiple common story points field names
      const storyPoints = issue.fields.story_points
        || issue.fields.customfield_10004
        || null;

      return {
        key: issue.key,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype?.name || null,
        status: issue.fields.status?.name || null,
        assignee: issue.fields.assignee?.displayName || null,
        storyPoints: storyPoints,
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
 * Fetch all issue keys that are feature work.
 *
 * Uses JQL: Stories/Tasks in RHOAIENG that are children of Epics
 * that are children of Features in RHAISTRAT.
 */
async function fetchFeatureWorkKeys() {
  const featureKeys = new Set();
  let startAt = 0;
  const maxResults = 100;
  let total = Infinity;

  const jql = encodeURIComponent(
    'issueFunction in linkedIssuesOf(' +
    '"project = RHOAIENG AND issuetype = Epic AND issueFunction in linkedIssuesOf(' +
    '\'project = RHAISTRAT AND issuetype = Feature\', \'is parent of\')", ' +
    '"is epic of")'
  );

  while (startAt < total) {
    const data = await jiraRequest(
      `/rest/api/2/search?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&fields=key`
    );

    total = data.total;
    data.issues.forEach(issue => featureKeys.add(issue.key));
    startAt += maxResults;
  }

  console.log(`Found ${featureKeys.size} feature work issue keys`);
  return featureKeys;
}

/**
 * Classify an issue into a 40-40-20 bucket
 */
function classifyIssue(issue, featureWorkKeys) {
  // Bugs always go to bugs-tech-debt
  if (issue.issueType === 'Bug') {
    return 'bugs-tech-debt';
  }

  // Stories/Tasks that are children of feature epics
  if (featureWorkKeys.has(issue.key)) {
    return 'feature-work';
  }

  // Everything else defaults to bugs-tech-debt
  // (Learning bucket excluded for now)
  return 'bugs-tech-debt';
}

/**
 * Build sprint summary from classified issues
 */
function buildSprintSummary(issues) {
  const buckets = {
    'bugs-tech-debt': { points: 0, issueCount: 0, completedPoints: 0 },
    'feature-work': { points: 0, issueCount: 0, completedPoints: 0 },
    'learning': { points: 0, issueCount: 0, completedPoints: 0 }
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

    // Merge with existing teams config (preserve enabled/disabled state)
    const existingTeams = await readFromS3('teams.json');
    if (existingTeams && existingTeams.teams) {
      const existingMap = new Map(existingTeams.teams.map(t => [t.boardId, t]));
      const mergedTeams = boards.map(b => {
        const existing = existingMap.get(b.id);
        return existing || {
          boardId: b.id,
          boardName: b.name,
          displayName: b.name.replace(/^RHOAIENG\s*[-–]\s*/, ''),
          enabled: true
        };
      });
      await uploadToS3('teams.json', { teams: mergedTeams });
    } else {
      await uploadToS3('teams.json', {
        teams: boards.map(b => ({
          boardId: b.id,
          boardName: b.name,
          displayName: b.name.replace(/^RHOAIENG\s*[-–]\s*/, ''),
          enabled: true
        }))
      });
    }

    res.json({ success: true, boardCount: boards.length });
  } catch (error) {
    console.error('Discover boards error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /refresh - Fetch all data from Jira, classify, and upload to S3
 */
app.post('/refresh', async function(req, res) {
  try {
    // Verify Firebase token
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const projectKey = req.body.projectKey || 'RHOAIENG';

    console.log(`Starting refresh for project ${projectKey} (user: ${verification.email})`);
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

    // Step 2: Fetch feature work keys for classification
    console.log('Fetching feature work keys...');
    let featureWorkKeys;
    try {
      featureWorkKeys = await fetchFeatureWorkKeys();
    } catch (error) {
      console.warn('Failed to fetch feature work keys, all issues will default to bugs-tech-debt:', error.message);
      featureWorkKeys = new Set();
    }

    // Step 3: For each board, fetch sprints and issues
    const sprintResults = [];

    for (const board of boards) {
      console.log(`Processing board: ${board.name} (${board.id})`);

      const sprints = await fetchSprints(board.id);
      console.log(`  Found ${sprints.length} sprints`);

      // Process active and recent closed sprints (last 5 closed)
      const activeSprints = sprints.filter(s => s.state === 'active');
      const futureSprints = sprints.filter(s => s.state === 'future');
      const closedSprints = sprints
        .filter(s => s.state === 'closed')
        .sort((a, b) => new Date(b.completeDate || 0) - new Date(a.completeDate || 0))
        .slice(0, 5);

      const sprintsToProcess = [...activeSprints, ...futureSprints, ...closedSprints];

      for (const sprint of sprintsToProcess) {
        console.log(`  Processing sprint: ${sprint.name} (${sprint.state})`);

        const rawIssues = await fetchSprintIssues(sprint.id);

        // Classify and enrich issues
        const classifiedIssues = rawIssues.map(issue => {
          const bucket = classifyIssue(issue, featureWorkKeys);
          const completed = issue.resolution != null;

          return {
            ...issue,
            bucket,
            completed
          };
        });

        const summary = buildSprintSummary(classifiedIssues);

        console.log(`    ${classifiedIssues.length} issues, ${summary.totalPoints} pts | bugs-tech-debt: ${summary.buckets['bugs-tech-debt'].points} pts, feature-work: ${summary.buckets['feature-work'].points} pts | ${summary.unestimatedIssueCount} unestimated`);

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

        // Upload sprint data to S3
        await uploadToS3(`sprints/${sprint.id}.json`, sprintData);

        sprintResults.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          state: sprint.state,
          issueCount: classifiedIssues.length,
          totalPoints: summary.totalPoints
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
    }

    // Step 4: Upload boards index
    await uploadToS3('boards.json', {
      lastUpdated: new Date().toISOString(),
      boards: allBoards
    });

    // Step 5: Upload teams config if it doesn't exist
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

    const result = {
      success: true,
      projectKey,
      boardCount: boards.length,
      sprintCount: sprintResults.length,
      featureWorkKeysFound: featureWorkKeys.size,
      sprints: sprintResults
    };

    const refreshElapsed = ((Date.now() - refreshStart) / 1000).toFixed(1);
    console.log(`Refresh complete: ${boards.length} boards, ${sprintResults.length} sprints, ${featureWorkKeys.size} feature keys (${refreshElapsed}s)`);

    res.json(result);

  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      error: error.message
    });
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
