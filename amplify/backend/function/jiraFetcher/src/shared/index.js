/**
 * Shared business logic for 40-40-20 tracker.
 * Re-exports everything from classification, config, jira-client, and orchestration.
 */

const classification = require('./classification');
const config = require('./config');
const jiraClient = require('./jira-client');
const orchestration = require('./orchestration');

module.exports = {
  ...classification,
  ...config,
  ...jiraClient,
  ...orchestration
};
