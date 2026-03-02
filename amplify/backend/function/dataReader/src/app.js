/**
 * Data Reader Lambda
 * Reads cached sprint allocation data from S3.
 * Manages team configuration.
 *
 * Requires Firebase authentication token with @redhat.com domain.
 */

const express = require('express');
const bodyParser = require('body-parser');
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
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

// S3 Client
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const S3_BUCKET = process.env.S3_BUCKET;

/**
 * Convert S3 stream to string
 */
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
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
    const bodyContents = await streamToString(response.Body);
    return JSON.parse(bodyContents);
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * Read from S3 with fallback: try namespaced path first, then flat path.
 * Used during migration period to support both old and new key layouts.
 */
async function readWithFallback(project, key) {
  if (project && project !== 'RHOAIENG') {
    return readFromS3(`data/${project}/${key}`);
  }
  // Default project: try namespaced first, fall back to flat
  const namespaced = await readFromS3(`data/RHOAIENG/${key}`);
  if (namespaced) return namespaced;
  return readFromS3(key);
}

/**
 * Write JSON to S3
 */
async function writeToS3(key, data) {
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
}

/**
 * GET /projects - Get list of configured projects
 */
app.get('/projects', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    console.log(`Reading projects config (user: ${verification.email})`);

    const data = await readFromS3('config/orgs.json');

    if (!data) {
      // Fallback: return single default project
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

/**
 * GET /org-summary - Get org-wide allocation summary
 */
app.get('/org-summary', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    console.log(`Reading org summary (user: ${verification.email})`);

    const data = await readFromS3('data/org-summary.json');

    if (!data) {
      return res.json({ lastUpdated: null, totalPoints: 0, projectCount: 0, boardCount: 0, buckets: {} });
    }

    res.json(data);

  } catch (error) {
    console.error('Read org summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /projects/:projectKey/summary - Get project-level dashboard summary
 */
app.get('/projects/:projectKey/summary', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const { projectKey } = req.params;
    console.log(`Reading project summary for ${projectKey} (user: ${verification.email})`);

    const data = await readWithFallback(projectKey, 'dashboard-summary.json');

    if (!data) {
      return res.json({ lastUpdated: null, boards: {} });
    }

    res.json(data);

  } catch (error) {
    console.error(`Read project summary error for ${req.params.projectKey}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /boards - Get list of boards
 */
app.get('/boards', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const project = req.query.project || null;
    console.log(`Reading boards${project ? ` for project ${project}` : ''} (user: ${verification.email})`);

    const data = await readWithFallback(project, 'boards.json');

    if (!data) {
      return res.json({ boards: [], lastUpdated: null });
    }

    // Build board-like entries from teams config (one entry per team, supporting sub-teams)
    const teamsData = await readWithFallback(project, 'teams.json');
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

/**
 * GET /boards/:boardId/sprints - Get sprints for a board
 */
app.get('/boards/:boardId/sprints', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const { boardId } = req.params;
    const project = req.query.project || null;
    console.log(`Reading sprints for board ${boardId} (user: ${verification.email})`);

    // Try team-based key first, fall back to old board-based key for backward compat
    let data = await readWithFallback(project, `sprints/team-${boardId}.json`);
    if (!data) {
      data = await readWithFallback(project, `sprints/board-${boardId}.json`);
    }

    if (!data) {
      return res.json({ sprints: [] });
    }

    res.json(data);

  } catch (error) {
    console.error(`Read sprints error for board ${req.params.boardId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /sprints/:sprintId/issues - Get issues for a sprint
 */
app.get('/sprints/:sprintId/issues', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const { sprintId } = req.params;
    const project = req.query.project || null;
    console.log(`Reading issues for sprint ${sprintId} (user: ${verification.email})`);

    const data = await readWithFallback(project, `sprints/${sprintId}.json`);

    if (!data) {
      return res.status(500).json({
        error: 'Sprint data not found. Please refresh to fetch data from Jira.'
      });
    }

    res.json(data);

  } catch (error) {
    console.error(`Read sprint issues error for sprint ${req.params.sprintId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /teams - Get team configuration
 */
app.get('/teams', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const project = req.query.project || null;
    console.log(`Reading teams config (user: ${verification.email})`);

    const data = await readWithFallback(project, 'teams.json');

    if (!data) {
      return res.json({ teams: [] });
    }

    res.json(data);

  } catch (error) {
    console.error('Read teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /teams - Save team configuration
 */
app.post('/teams', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const { teams } = req.body;

    if (!teams || !Array.isArray(teams)) {
      return res.status(400).json({
        error: 'Request must include "teams" array'
      });
    }

    const project = req.query.project || null;
    const key = (project && project !== 'RHOAIENG') ? `data/${project}/teams.json` : 'teams.json';

    console.log(`Saving ${teams.length} teams config (user: ${verification.email})`);

    // Mark all teams as manually configured to prevent auto-disable on next discover
    const teamsWithManualFlag = teams.map(t => ({ ...t, manuallyConfigured: true }));

    await writeToS3(key, { teams: teamsWithManualFlag });

    res.json({ success: true, teams: teamsWithManualFlag });

  } catch (error) {
    console.error('Save teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /dashboard-summary - Get pre-computed dashboard summary
 */
app.get('/dashboard-summary', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const project = req.query.project || null;
    console.log(`Reading dashboard summary (user: ${verification.email})`);

    const data = await readWithFallback(project, 'dashboard-summary.json');

    if (!data) {
      return res.json({ lastUpdated: null, boards: {} });
    }

    res.json(data);

  } catch (error) {
    console.error('Read dashboard summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /projects - Save project configuration
 */
app.post('/projects', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const { orgName, projects } = req.body;

    if (!projects || !Array.isArray(projects)) {
      return res.status(400).json({
        error: 'Request must include "projects" array'
      });
    }

    for (const project of projects) {
      if (!project.key || !project.name || !project.pillar) {
        return res.status(400).json({
          error: 'Each project must have "key", "name", and "pillar"'
        });
      }
    }

    console.log(`Saving ${projects.length} projects config (user: ${verification.email})`);

    await writeToS3('config/orgs.json', { orgName: orgName || 'AI Engineering', projects });

    res.json({ success: true, projects });

  } catch (error) {
    console.error('Save projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle OPTIONS for CORS preflight
app.options('/boards', function(req, res) { res.status(200).end(); });
app.options('/boards/*', function(req, res) { res.status(200).end(); });
app.options('/sprints', function(req, res) { res.status(200).end(); });
app.options('/sprints/*', function(req, res) { res.status(200).end(); });
app.options('/teams', function(req, res) { res.status(200).end(); });
app.options('/dashboard-summary', function(req, res) { res.status(200).end(); });
app.options('/projects', function(req, res) { res.status(200).end(); });
app.options('/projects/*', function(req, res) { res.status(200).end(); });
app.options('/org-summary', function(req, res) { res.status(200).end(); });

app.listen(3000, function() {
  console.log("dataReader app started");
});

module.exports = app;
