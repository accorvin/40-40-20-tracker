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
 * GET /boards - Get list of boards
 */
app.get('/boards', async function(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const verification = await verifyFirebaseToken(authHeader);

    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    console.log(`Reading boards (user: ${verification.email})`);

    const data = await readFromS3('boards.json');

    if (!data) {
      return res.json({ boards: [], lastUpdated: null });
    }

    // Merge with team config for display names
    const teamsData = await readFromS3('teams.json');
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
    console.log(`Reading sprints for board ${boardId} (user: ${verification.email})`);

    const data = await readFromS3(`sprints/board-${boardId}.json`);

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
    console.log(`Reading issues for sprint ${sprintId} (user: ${verification.email})`);

    const data = await readFromS3(`sprints/${sprintId}.json`);

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

    console.log(`Reading teams config (user: ${verification.email})`);

    const data = await readFromS3('teams.json');

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

    console.log(`Saving ${teams.length} teams config (user: ${verification.email})`);

    await writeToS3('teams.json', { teams });

    res.json({ success: true, teams });

  } catch (error) {
    console.error('Save teams error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle OPTIONS for CORS preflight
app.options('/boards', function(req, res) { res.status(200).end(); });
app.options('/boards/*', function(req, res) { res.status(200).end(); });
app.options('/sprints', function(req, res) { res.status(200).end(); });
app.options('/sprints/*', function(req, res) { res.status(200).end(); });
app.options('/teams', function(req, res) { res.status(200).end(); });

app.listen(3000, function() {
  console.log("dataReader app started");
});

module.exports = app;
