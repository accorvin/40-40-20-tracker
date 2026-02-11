const awsServerlessExpress = require('aws-serverless-express');
const app = require('./app');
const { performRefresh } = require('./app');

const server = awsServerlessExpress.createServer(app);

exports.handler = async (event, context) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);

  // Scheduled EventBridge refresh (hourly cron)
  if (event.source === 'aws.events') {
    console.log('Scheduled refresh triggered');
    return performRefresh({
      projectKey: 'RHOAIENG',
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
