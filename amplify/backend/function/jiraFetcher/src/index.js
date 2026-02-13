const awsServerlessExpress = require('aws-serverless-express');
const app = require('./app');
const { performRefresh, performMultiProjectRefresh, readOrgConfig, processSqsMessage } = require('./app');

const server = awsServerlessExpress.createServer(app);

exports.handler = async (event, context) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);

  // SQS event: process a single board refresh message
  if (event.Records && event.Records[0]?.eventSource === 'aws:sqs') {
    const record = event.Records[0];
    const message = JSON.parse(record.body);
    console.log(`SQS message: board ${message.boardId} for project ${message.projectKey}`);
    return processSqsMessage(message);
  }

  // Scheduled EventBridge refresh (hourly cron) — kept as fallback until scheduler Lambda is deployed
  if (event.source === 'aws.events') {
    console.log('Scheduled refresh triggered');
    const orgConfig = await readOrgConfig();
    const projects = orgConfig?.projects || [{ key: 'RHOAIENG', name: 'OpenShift AI Engineering' }];

    if (projects.length === 1) {
      // Single project: use original performRefresh for backward compatibility
      return performRefresh({
        projectKey: projects[0].key,
        hardRefresh: false
      });
    }

    return performMultiProjectRefresh({
      projects,
      hardRefresh: false
    });
  }

  // Direct async invocation (from self-invoke for background refresh)
  if (event.action === 'refresh') {
    console.log('Handling direct refresh invocation');
    return performRefresh({
      projectKey: event.projectKey || 'RHOAIENG',
      hardRefresh: event.hardRefresh || false
    });
  }

  // API Gateway request — proxy to Express
  return awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
};
