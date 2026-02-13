/**
 * Aggregator Lambda
 *
 * Triggered by EventBridge 20 minutes after the scheduler. Reads all project
 * dashboard summaries from S3 and recomputes rollup summaries (project-level
 * and org-level).
 *
 * Uses eventually consistent data — if some boards haven't been updated yet,
 * the aggregator uses whatever data is available.
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const S3_BUCKET = process.env.S3_BUCKET;

async function readFromS3(key) {
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

async function writeToS3(key, data) {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  });

  await s3Client.send(command);
  console.log(`Wrote ${key}`);
}

// ─── Aggregation logic (inlined from shared/classification.js) ───

function emptyBuckets() {
  return {
    'tech-debt-quality': { points: 0, issueCount: 0, completedPoints: 0 },
    'new-features': { points: 0, issueCount: 0, completedPoints: 0 },
    'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
    'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
  };
}

function addBuckets(target, source) {
  for (const key of Object.keys(target)) {
    const s = source[key];
    if (!s) continue;
    target[key].points += s.points || 0;
    target[key].issueCount += s.issueCount || 0;
    target[key].completedPoints += s.completedPoints || 0;
  }
}

function buildProjectSummary(boardSummaries) {
  const buckets = emptyBuckets();
  let totalPoints = 0;
  let estimatedIssueCount = 0;
  let unestimatedIssueCount = 0;

  for (const summary of boardSummaries) {
    totalPoints += summary.totalPoints || 0;
    estimatedIssueCount += summary.estimatedIssueCount || 0;
    unestimatedIssueCount += summary.unestimatedIssueCount || 0;
    if (summary.buckets) {
      addBuckets(buckets, summary.buckets);
    }
  }

  return {
    totalPoints,
    boardCount: boardSummaries.length,
    estimatedIssueCount,
    unestimatedIssueCount,
    buckets
  };
}

function buildOrgSummary(projectSummaries) {
  const buckets = emptyBuckets();
  let totalPoints = 0;
  let boardCount = 0;
  let estimatedIssueCount = 0;
  let unestimatedIssueCount = 0;

  for (const summary of projectSummaries) {
    totalPoints += summary.totalPoints || 0;
    boardCount += summary.boardCount || 0;
    estimatedIssueCount += summary.estimatedIssueCount || 0;
    unestimatedIssueCount += summary.unestimatedIssueCount || 0;
    if (summary.buckets) {
      addBuckets(buckets, summary.buckets);
    }
  }

  return {
    totalPoints,
    projectCount: projectSummaries.length,
    boardCount,
    estimatedIssueCount,
    unestimatedIssueCount,
    buckets
  };
}

// ─── Main handler ───

/**
 * Read dashboard-summary.json for a project, trying namespaced path first.
 */
async function readDashboardSummary(projectKey) {
  if (projectKey !== 'RHOAIENG') {
    return readFromS3(`data/${projectKey}/dashboard-summary.json`);
  }
  const namespaced = await readFromS3('data/RHOAIENG/dashboard-summary.json');
  if (namespaced) return namespaced;
  return readFromS3('dashboard-summary.json');
}

exports.handler = async (event) => {
  console.log(`Aggregator triggered: ${JSON.stringify(event)}`);

  // Read org configuration
  const orgConfig = await readFromS3('config/orgs.json');
  const projects = orgConfig?.projects || [
    { key: 'RHOAIENG', name: 'OpenShift AI Engineering' }
  ];

  console.log(`Aggregating summaries for ${projects.length} projects`);

  const projectSummaries = [];

  for (const project of projects) {
    const dashboardSummary = await readDashboardSummary(project.key);

    if (!dashboardSummary?.boards || Object.keys(dashboardSummary.boards).length === 0) {
      console.log(`No dashboard data for project ${project.key}, skipping`);
      continue;
    }

    // Extract board summaries from dashboard-summary.json
    const boardSummaries = Object.values(dashboardSummary.boards)
      .filter(b => b.summary)
      .map(b => b.summary);

    const projSummary = buildProjectSummary(boardSummaries);
    projectSummaries.push(projSummary);

    console.log(`Project ${project.key}: ${boardSummaries.length} boards, ${projSummary.totalPoints} total points`);
  }

  // Build and write org-level summary
  const orgSummary = buildOrgSummary(projectSummaries);

  await writeToS3('data/org-summary.json', {
    lastUpdated: new Date().toISOString(),
    ...orgSummary
  });

  console.log(`Org summary: ${orgSummary.projectCount} projects, ${orgSummary.boardCount} boards, ${orgSummary.totalPoints} total points`);

  return {
    success: true,
    projectCount: orgSummary.projectCount,
    boardCount: orgSummary.boardCount,
    totalPoints: orgSummary.totalPoints
  };
};
