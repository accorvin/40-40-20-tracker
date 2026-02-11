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
const { createJiraClient } = require('./shared/jira-client');
const { discoverBoards, performRefresh: sharedPerformRefresh } = require('./shared/orchestration');

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

// Create Jira client using Lambda's jiraRequest (with SSM token + timing logs)
const jiraClient = createJiraClient({ jiraRequest, jiraHost: JIRA_HOST });

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

// Shared dependency bundle for orchestration functions
const orchestrationDeps = {
  ...jiraClient,
  readStorage: readFromS3,
  writeStorage: uploadToS3
};

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

    console.log(`Discovering boards (user: ${verification.email})`);

    const result = await discoverBoards({ ...orchestrationDeps, projectKey });

    res.json(result);
  } catch (error) {
    console.error('Discover boards error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Perform refresh with Lambda's S3/Jira dependencies pre-filled.
 * Called from both Express handler and direct Lambda invocation (index.js).
 */
async function performRefresh({ projectKey, hardRefresh }) {
  return sharedPerformRefresh({ ...orchestrationDeps, projectKey, hardRefresh });
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
