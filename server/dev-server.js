/**
 * Local development server
 *
 * Combines the jiraFetcher and dataReader Express routes into a single
 * server, using local file storage instead of S3. No AWS credentials needed.
 *
 * Usage:
 *   JIRA_TOKEN=your-token node server/dev-server.js
 *
 * Or with a .env file:
 *   node -r dotenv/config server/dev-server.js
 */

const express = require('express');
const fetch = require('node-fetch');
const { readFromStorage, writeToStorage } = require('./storage');

const app = express();
app.use(express.json());

// Enable CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

const JIRA_HOST = process.env.JIRA_HOST || 'https://issues.redhat.com';
const PORT = process.env.API_PORT || 3001;

// ─── Auth middleware (skip Firebase verification in local dev) ───

function localAuth(req, res, next) {
  // In local dev, accept any request but log a warning if no token
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log('  [auth] No auth header - OK in local dev');
  }
  req.userEmail = 'local-dev@redhat.com';
  next();
}

app.use(localAuth);

// ─── Jira API helpers ───

function getJiraToken() {
  const token = process.env.JIRA_TOKEN;
  if (!token) {
    throw new Error(
      'JIRA_TOKEN environment variable is not set.\n' +
      'Set it in a .env file or pass it directly:\n' +
      '  JIRA_TOKEN=your-token node server/dev-server.js'
    );
  }
  return token;
}

async function jiraRequest(path) {
  const token = getJiraToken();

  const response = await fetch(`${JIRA_HOST}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API error (${response.status}): ${text}`);
  }

  return response.json();
}

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

function classifyIssue(issue, featureWorkKeys) {
  if (issue.issueType === 'Bug') {
    return 'bugs-tech-debt';
  }
  if (featureWorkKeys.has(issue.key)) {
    return 'feature-work';
  }
  return 'bugs-tech-debt';
}

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

  return { totalPoints, estimatedIssueCount, unestimatedIssueCount, buckets };
}

// ─── Routes: jiraFetcher ───

app.post('/api/discover-boards', async function(req, res) {
  try {
    const projectKey = req.body.projectKey || 'RHOAIENG';

    console.log(`\nDiscovering boards for project ${projectKey}`);

    const boards = await fetchBoards(projectKey);
    console.log(`Found ${boards.length} scrum boards`);

    writeToStorage('boards.json', {
      lastUpdated: new Date().toISOString(),
      boards: boards
    });

    // Merge with existing teams config (preserve enabled/disabled state)
    const existingTeams = readFromStorage('teams.json');
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
      writeToStorage('teams.json', { teams: mergedTeams });
    } else {
      writeToStorage('teams.json', {
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

app.post('/api/refresh', async function(req, res) {
  try {
    const projectKey = req.body.projectKey || 'RHOAIENG';

    console.log(`\nStarting refresh for project ${projectKey}`);

    // Fetch boards
    console.log('Fetching boards...');
    const allBoards = await fetchBoards(projectKey);
    console.log(`Found ${allBoards.length} scrum boards`);

    // Filter to enabled boards only
    const teamsData = readFromStorage('teams.json');
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

    // Fetch feature work keys
    console.log('Fetching feature work keys...');
    let featureWorkKeys;
    try {
      featureWorkKeys = await fetchFeatureWorkKeys();
    } catch (error) {
      console.warn('Failed to fetch feature work keys, defaulting all to bugs-tech-debt:', error.message);
      featureWorkKeys = new Set();
    }

    // Process each board
    const sprintResults = [];

    for (const board of boards) {
      console.log(`Processing board: ${board.name} (${board.id})`);

      const sprints = await fetchSprints(board.id);
      console.log(`  Found ${sprints.length} sprints`);

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

        const classifiedIssues = rawIssues.map(issue => ({
          ...issue,
          bucket: classifyIssue(issue, featureWorkKeys),
          completed: issue.resolution != null
        }));

        const summary = buildSprintSummary(classifiedIssues);

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

        writeToStorage(`sprints/${sprint.id}.json`, sprintData);

        sprintResults.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          state: sprint.state,
          issueCount: classifiedIssues.length,
          totalPoints: summary.totalPoints
        });
      }

      writeToStorage(`sprints/board-${board.id}.json`, {
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

    writeToStorage('boards.json', {
      lastUpdated: new Date().toISOString(),
      boards: allBoards
    });

    // Auto-generate teams config if it doesn't exist
    const existingTeams = readFromStorage('teams.json');
    if (!existingTeams) {
      writeToStorage('teams.json', {
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

    console.log(`\nRefresh complete: ${boards.length} boards, ${sprintResults.length} sprints`);
    res.json(result);

  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Routes: dataReader ───

app.get('/api/boards', function(req, res) {
  try {
    const data = readFromStorage('boards.json');

    if (!data) {
      return res.json({ boards: [], lastUpdated: null });
    }

    // Merge with team config
    const teamsData = readFromStorage('teams.json');
    if (teamsData && teamsData.teams) {
      const teamMap = new Map(teamsData.teams.map(t => [t.boardId, t]));
      data.boards = data.boards
        .map(board => {
          const teamConfig = teamMap.get(board.id);
          return {
            ...board,
            displayName: teamConfig?.displayName || board.name,
            enabled: teamConfig?.enabled !== false
          };
        })
        .filter(board => board.enabled);
    }

    res.json(data);
  } catch (error) {
    console.error('Read boards error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/boards/:boardId/sprints', function(req, res) {
  try {
    const { boardId } = req.params;
    const data = readFromStorage(`sprints/board-${boardId}.json`);

    if (!data) {
      return res.json({ sprints: [] });
    }

    res.json(data);
  } catch (error) {
    console.error('Read sprints error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sprints/:sprintId/issues', function(req, res) {
  try {
    const { sprintId } = req.params;
    const data = readFromStorage(`sprints/${sprintId}.json`);

    if (!data) {
      return res.status(500).json({
        error: 'Sprint data not found. Please refresh to fetch data from Jira.'
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Read sprint issues error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/teams', function(req, res) {
  try {
    const data = readFromStorage('teams.json');
    if (!data) {
      return res.json({ teams: [] });
    }
    res.json(data);
  } catch (error) {
    console.error('Read teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/teams', function(req, res) {
  try {
    const { teams } = req.body;
    if (!teams || !Array.isArray(teams)) {
      return res.status(400).json({ error: 'Request must include "teams" array' });
    }

    writeToStorage('teams.json', { teams });
    res.json({ success: true, teams });
  } catch (error) {
    console.error('Save teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CORS preflight
app.options('/api/{*path}', function(req, res) { res.status(200).end(); });

// ─── Start ───

app.listen(PORT, function() {
  console.log(`\n40-40-20 Tracker dev server running at http://localhost:${PORT}`);
  console.log(`Jira host: ${JIRA_HOST}`);
  console.log(`Local storage: ./data/`);
  console.log(`JIRA_TOKEN: ${process.env.JIRA_TOKEN ? 'set' : 'NOT SET (refresh will fail)'}\n`);
});
