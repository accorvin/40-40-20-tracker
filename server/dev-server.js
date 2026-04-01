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
const { createJiraClient } = require('../amplify/backend/function/jiraFetcher/src/shared/jira-client');
const { discoverBoards, performRefresh, performMultiProjectRefresh, processBoard, processKanbanBoard } = require('../amplify/backend/function/jiraFetcher/src/shared/orchestration');
const { buildProjectSummary, buildOrgSummary } = require('../amplify/backend/function/jiraFetcher/src/shared/classification');
const { getStoragePrefix, createPrefixedStorage } = require('../amplify/backend/function/jiraFetcher/src/shared/config');

const app = express();
app.use(express.json());

// Enable CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

const JIRA_HOST = process.env.JIRA_HOST || 'https://redhat.atlassian.net';
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

function getJiraEmail() {
  const email = process.env.JIRA_EMAIL;
  if (!email) {
    throw new Error(
      'JIRA_EMAIL environment variable is not set.\n' +
      'Set it in a .env file or pass it directly:\n' +
      '  JIRA_EMAIL=your-email@redhat.com node server/dev-server.js'
    );
  }
  return email;
}

async function jiraRequest(path, { method = 'GET', body = null } = {}) {
  const token = getJiraToken();
  const email = getJiraEmail();
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const fetchOptions = {
      method,
      headers: {
        'Authorization': `Basic ${Buffer.from(email + ':' + token).toString('base64')}`,
        'Accept': 'application/json'
      }
    };
    if (body) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${JIRA_HOST}${path}`, fetchOptions);

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(response.headers.get('retry-after'), 10);
      const delay = (!isNaN(retryAfter) && retryAfter > 0) ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
      console.warn(`[Jira API] Rate limited (429), retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Jira API error (${response.status}): ${text}`);
    }

    return response.json();
  }
}

// Create Jira client using dev server's simple jiraRequest
const jiraClient = createJiraClient({ jiraRequest, jiraHost: JIRA_HOST });

// Shared dependency bundle for orchestration functions
const orchestrationDeps = {
  ...jiraClient,
  readStorage: readFromStorage,
  writeStorage: writeToStorage
};

// ─── Multi-project helpers ───

function readOrgConfig() {
  return readFromStorage('config/orgs.json');
}

/**
 * Read from storage with fallback: try namespaced path first, then flat path.
 */
function readWithFallback(project, key) {
  if (project && project !== 'RHOAIENG') {
    return readFromStorage(`data/${project}/${key}`);
  }
  const namespaced = readFromStorage(`data/RHOAIENG/${key}`);
  if (namespaced) return namespaced;
  return readFromStorage(key);
}

/**
 * Get orchestration deps with storage optionally prefixed for a project.
 */
function getDepsForProject(projectKey) {
  if (!projectKey || projectKey === 'RHOAIENG') {
    return orchestrationDeps;
  }
  const prefix = getStoragePrefix(projectKey);
  const { read, write } = createPrefixedStorage(prefix, readFromStorage, writeToStorage);
  return { ...jiraClient, readStorage: read, writeStorage: write };
}

// ─── Routes: jiraFetcher ───

app.post('/api/discover-boards', async function(req, res) {
  try {
    const projectKey = req.body.projectKey || 'RHOAIENG';
    const deps = getDepsForProject(projectKey);
    console.log(`\nDiscovering boards for project ${projectKey}`);

    const result = await discoverBoards({ ...deps, projectKey });

    res.json(result);
  } catch (error) {
    console.error('Discover boards error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/refresh', function(req, res) {
  const projectKey = req.body.projectKey || 'RHOAIENG';
  const hardRefresh = req.body.hardRefresh || false;

  // Read teams to determine board count for response
  const deps = getDepsForProject(projectKey);
  const teamsData = deps.readStorage('teams.json');
  const enabledTeams = teamsData?.teams?.filter(t => t.enabled !== false) || [];

  res.json({ status: 'started', boardCount: enabledTeams.length });

  // Simulate SQS fan-out: process each board sequentially
  setImmediate(async () => {
    try {
      console.log(`\nSimulating fan-out refresh for ${projectKey}: ${enabledTeams.length} boards`);
      const boardResults = [];

      for (const team of enabledTeams) {
        try {
          const board = {
            id: team.boardId,
            name: team.boardName || team.displayName,
            teamId: team.teamId || String(team.boardId),
            sprintFilter: team.sprintFilter || '',
            calculationMode: team.calculationMode || 'points',
            boardType: team.boardType || 'scrum'
          };

          let result;
          if (board.boardType === 'kanban') {
            result = await processKanbanBoard({
              board,
              fetchBoardConfiguration: deps.fetchBoardConfiguration,
              fetchFilterJql: deps.fetchFilterJql,
              fetchIssuesByJql: deps.fetchIssuesByJql,
              readStorage: deps.readStorage,
              writeStorage: deps.writeStorage
            });
          } else {
            result = await processBoard({
              board,
              hardRefresh,
              fetchSprints: deps.fetchSprints,
              fetchSprintIssues: deps.fetchSprintIssues,
              readStorage: deps.readStorage,
              writeStorage: deps.writeStorage
            });
          }
          boardResults.push(result);
          console.log(`  Board ${team.boardName || team.displayName}: ${result.sprintResults.length} sprints`);
        } catch (error) {
          console.error(`  Board ${team.boardName || team.displayName} failed:`, error.message);
        }
      }

      // Simulate aggregator: build dashboard summary from results
      const dashboardSummary = { lastUpdated: new Date().toISOString(), boards: {} };
      for (const { board, dashboardSprint, dashboardSprintResult } of boardResults) {
        if (dashboardSprint && dashboardSprintResult) {
          dashboardSummary.boards[board.teamId || board.id] = {
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
      deps.writeStorage('dashboard-summary.json', dashboardSummary);

      console.log(`Fan-out refresh complete: ${boardResults.length} boards processed`);
    } catch (error) {
      console.error('Background fan-out refresh error:', error);
    }
  });
});

// ─── Routes: dataReader ───

app.get('/api/projects', function(req, res) {
  try {
    const data = readOrgConfig();

    if (!data) {
      return res.json({
        orgName: 'AI Engineering',
        projects: [{ key: 'RHOAIENG', name: 'OpenShift AI Engineering', pillar: 'OpenShift AI' }]
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Read projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/org-summary', function(req, res) {
  try {
    const data = readFromStorage('data/org-summary.json');

    if (!data) {
      return res.json({ lastUpdated: null, totalPoints: 0, projectCount: 0, boardCount: 0, buckets: {} });
    }

    res.json(data);
  } catch (error) {
    console.error('Read org summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:projectKey/summary', function(req, res) {
  try {
    const { projectKey } = req.params;
    const data = readWithFallback(projectKey, 'dashboard-summary.json');

    if (!data) {
      return res.json({ lastUpdated: null, boards: {} });
    }

    res.json(data);
  } catch (error) {
    console.error('Read project summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/boards', function(req, res) {
  try {
    const project = req.query.project || null;
    const data = readWithFallback(project, 'boards.json');

    if (!data) {
      return res.json({ boards: [], lastUpdated: null });
    }

    // Build board-like entries from teams config (one entry per team, supporting sub-teams)
    const teamsData = readWithFallback(project, 'teams.json');
    if (teamsData && teamsData.teams) {
      const boardMap = new Map(data.boards.map(b => [b.id, b]));
      data.boards = teamsData.teams
        .filter(t => t.enabled !== false)
        .map(t => {
          const board = boardMap.get(t.boardId) || {};
          return {
            ...board,
            id: t.teamId || String(t.boardId),
            boardId: t.boardId,
            name: t.boardName || board.name,
            displayName: t.displayName || t.boardName || board.name
          };
        });
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
    const project = req.query.project || null;
    // Try team-based key first, fall back to old board-based key for backward compat
    let data = readWithFallback(project, `sprints/team-${boardId}.json`);
    if (!data) {
      data = readWithFallback(project, `sprints/board-${boardId}.json`);
    }

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
    const project = req.query.project || null;
    const data = readWithFallback(project, `sprints/${sprintId}.json`);

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
    const project = req.query.project || null;
    const data = readWithFallback(project, 'teams.json');
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

    const project = req.query.project || null;
    const key = (project && project !== 'RHOAIENG') ? `data/${project}/teams.json` : 'teams.json';

    writeToStorage(key, { teams });
    res.json({ success: true, teams });
  } catch (error) {
    console.error('Save teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', function(req, res) {
  try {
    const { orgName, projects } = req.body;
    if (!projects || !Array.isArray(projects)) {
      return res.status(400).json({ error: 'Request must include "projects" array' });
    }

    for (const project of projects) {
      if (!project.key || !project.name || !project.pillar) {
        return res.status(400).json({
          error: 'Each project must have "key", "name", and "pillar"'
        });
      }
    }

    writeToStorage('config/orgs.json', { orgName: orgName || 'AI Engineering', projects });
    res.json({ success: true, projects });
  } catch (error) {
    console.error('Save projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard-summary', function(req, res) {
  try {
    const project = req.query.project || null;
    const data = readWithFallback(project, 'dashboard-summary.json');
    if (data) {
      return res.json(data);
    }

    // Build dashboard summary on-the-fly from existing sprint data
    const teamsData = readWithFallback(project, 'teams.json');
    const boardsData = readWithFallback(project, 'boards.json');
    if (!teamsData?.teams && (!boardsData || !boardsData.boards)) {
      return res.json({ lastUpdated: null, boards: {} });
    }

    const summary = { lastUpdated: boardsData?.lastUpdated || new Date().toISOString(), boards: {} };

    // Iterate teams (supports sub-teams with different filters)
    const enabledTeams = teamsData?.teams?.filter(t => t.enabled !== false) || [];
    for (const team of enabledTeams) {
      const teamId = team.teamId || String(team.boardId);
      // Try team-based key first, fall back to old board-based key
      let teamSprints = readWithFallback(project, `sprints/team-${teamId}.json`);
      if (!teamSprints) {
        teamSprints = readWithFallback(project, `sprints/board-${team.boardId}.json`);
      }
      if (!teamSprints?.sprints?.length) continue;

      // Pick active sprint, or most recent closed
      const activeSprint = teamSprints.sprints.find(s => s.state === 'active');
      const dashSprint = activeSprint || [...teamSprints.sprints]
        .filter(s => s.state === 'closed')
        .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];

      if (!dashSprint) continue;

      const sprintData = readWithFallback(project, `sprints/${dashSprint.id}.json`);
      if (!sprintData?.summary) continue;

      summary.boards[teamId] = {
        sprint: {
          id: dashSprint.id,
          name: dashSprint.name,
          state: dashSprint.state,
          startDate: dashSprint.startDate,
          endDate: dashSprint.endDate
        },
        summary: sprintData.summary
      };
    }

    // Fallback: if no teams config, iterate boards directly (backward compat)
    if (!teamsData?.teams && boardsData?.boards) {
      for (const board of boardsData.boards) {
        let boardSprints = readWithFallback(project, `sprints/team-${board.id}.json`);
        if (!boardSprints) {
          boardSprints = readWithFallback(project, `sprints/board-${board.id}.json`);
        }
        if (!boardSprints?.sprints?.length) continue;

        const activeSprint = boardSprints.sprints.find(s => s.state === 'active');
        const dashSprint = activeSprint || [...boardSprints.sprints]
          .filter(s => s.state === 'closed')
          .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];

        if (!dashSprint) continue;

        const sprintData = readWithFallback(project, `sprints/${dashSprint.id}.json`);
        if (!sprintData?.summary) continue;

        summary.boards[board.id] = {
          sprint: {
            id: dashSprint.id,
            name: dashSprint.name,
            state: dashSprint.state,
            startDate: dashSprint.startDate,
            endDate: dashSprint.endDate
          },
          summary: sprintData.summary
        };
      }
    }

    res.json(summary);
  } catch (error) {
    console.error('Read dashboard summary error:', error);
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
