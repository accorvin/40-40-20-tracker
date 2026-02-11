/**
 * Shared business logic for 40-40-20 tracker.
 * Re-exports everything from classification, jira-client, and orchestration.
 */

const classification = require('./classification');
const jiraClient = require('./jira-client');
const orchestration = require('./orchestration');

module.exports = {
  ...classification,
  ...jiraClient,
  ...orchestration
};
