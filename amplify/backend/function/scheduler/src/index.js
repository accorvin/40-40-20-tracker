/**
 * Scheduler Lambda
 *
 * Triggered by EventBridge on a cron schedule. Reads org config and teams
 * from S3, then sends one SQS message per enabled board for fan-out
 * processing by the jiraFetcher worker.
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

const S3_BUCKET = process.env.S3_BUCKET;
const BOARD_REFRESH_QUEUE_URL = process.env.BOARD_REFRESH_QUEUE_URL;

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

/**
 * Read teams.json for a project, trying namespaced path first, then flat path.
 */
async function readTeamsForProject(projectKey) {
  if (projectKey !== 'RHOAIENG') {
    return readFromS3(`data/${projectKey}/teams.json`);
  }
  // Default project: try namespaced first, fall back to flat
  const namespaced = await readFromS3(`data/RHOAIENG/teams.json`);
  if (namespaced) return namespaced;
  return readFromS3('teams.json');
}

exports.handler = async (event) => {
  console.log(`Scheduler triggered: ${JSON.stringify(event)}`);

  if (!BOARD_REFRESH_QUEUE_URL) {
    throw new Error('BOARD_REFRESH_QUEUE_URL environment variable is not set');
  }

  // Read org configuration
  const orgConfig = await readFromS3('config/orgs.json');
  const projects = orgConfig?.projects || [
    { key: 'RHOAIENG', name: 'OpenShift AI Engineering' }
  ];

  console.log(`Found ${projects.length} projects`);

  let totalBoards = 0;

  for (const project of projects) {
    const teamsData = await readTeamsForProject(project.key);

    if (!teamsData?.teams?.length) {
      console.log(`No teams found for project ${project.key}, skipping`);
      continue;
    }

    const enabledTeams = teamsData.teams.filter(t => t.enabled !== false);
    console.log(`Project ${project.key}: ${enabledTeams.length} enabled boards (of ${teamsData.teams.length} total)`);

    for (const team of enabledTeams) {
      const command = new SendMessageCommand({
        QueueUrl: BOARD_REFRESH_QUEUE_URL,
        MessageBody: JSON.stringify({
          projectKey: project.key,
          boardId: team.boardId,
          boardName: team.boardName || team.displayName,
          hardRefresh: false
        })
      });

      await sqsClient.send(command);
      totalBoards++;
    }
  }

  console.log(`Scheduled ${totalBoards} board refresh messages across ${projects.length} projects`);

  return {
    success: true,
    projectCount: projects.length,
    boardCount: totalBoards
  };
};
