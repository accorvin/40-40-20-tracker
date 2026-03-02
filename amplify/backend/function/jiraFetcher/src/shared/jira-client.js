/**
 * Factory for Jira API client functions.
 *
 * Accepts a jiraRequest function and jiraHost string — the only things
 * that differ between Lambda (SSM token, timing logs) and dev server
 * (env var token, simple fetch).
 *
 * Returns { fetchBoards, fetchSprints, fetchSprintIssues }.
 */

function createJiraClient({ jiraRequest, jiraHost }) {
  /**
   * Fetch all scrum boards for a project (paginated)
   */
  async function fetchBoards(projectKey, boardType = 'scrum') {
    const boards = [];
    let startAt = 0;
    const maxResults = 50;
    let isLast = false;

    while (!isLast) {
      const data = await jiraRequest(
        `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&type=${boardType}&startAt=${startAt}&maxResults=${maxResults}`
      );

      boards.push(...data.values.map(board => ({
        id: board.id,
        name: board.name,
        projectKey: projectKey,
        type: boardType
      })));

      isLast = data.isLast;
      startAt += maxResults;
    }

    return boards;
  }

  /**
   * Fetch all sprints for a board (paginated)
   */
  async function fetchSprints(boardId) {
    const sprints = [];
    let startAt = 0;
    const maxResults = 50;
    let isLast = false;

    while (!isLast) {
      const data = await jiraRequest(
        `/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=${maxResults}`
      );

      sprints.push(...data.values.map(sprint => ({
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate || null,
        endDate: sprint.endDate || null,
        completeDate: sprint.completeDate || null,
        boardId: boardId
      })));

      isLast = data.isLast;
      startAt += maxResults;
    }

    return sprints;
  }

  /**
   * Fetch all issues for a sprint (paginated)
   */
  async function fetchSprintIssues(sprintId) {
    const issues = [];
    let startAt = 0;
    const maxResults = 100;
    let total = Infinity;

    while (startAt < total) {
      const data = await jiraRequest(
        `/rest/agile/1.0/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=${maxResults}&fields=summary,issuetype,status,assignee,customfield_12310243,customfield_12320040,resolution,resolutiondate`
      );

      total = data.total;

      issues.push(...data.issues.map(issue => {
        const storyPoints = issue.fields.customfield_12310243 ?? null;

        return {
          key: issue.key,
          summary: issue.fields.summary,
          issueType: issue.fields.issuetype?.name || null,
          status: issue.fields.status?.name || null,
          assignee: issue.fields.assignee?.displayName || null,
          storyPoints: storyPoints,
          activityType: issue.fields.customfield_12320040?.value || null,
          resolution: issue.fields.resolution?.name || null,
          resolutionDate: issue.fields.resolutiondate || null,
          url: `${jiraHost}/browse/${issue.key}`
        };
      }));

      startAt += maxResults;
    }

    return issues;
  }

  /**
   * Fetch board configuration to get the filter ID
   */
  async function fetchBoardConfiguration(boardId) {
    const data = await jiraRequest(`/rest/agile/1.0/board/${boardId}/configuration`);
    return { filterId: data.filter.id };
  }

  /**
   * Fetch the JQL string from a saved filter
   */
  async function fetchFilterJql(filterId) {
    const data = await jiraRequest(`/rest/api/2/filter/${filterId}`);
    return data.jql;
  }

  /**
   * Fetch issues by JQL query (paginated)
   */
  async function fetchIssuesByJql(jql) {
    const issues = [];
    let startAt = 0;
    const maxResults = 100;
    let total = Infinity;
    const fields = 'summary,issuetype,status,assignee,customfield_12310243,customfield_12320040,resolution,resolutiondate';

    while (startAt < total) {
      const data = await jiraRequest(
        `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}&startAt=${startAt}`
      );

      total = data.total;

      issues.push(...data.issues.map(issue => {
        const storyPoints = issue.fields.customfield_12310243 ?? null;

        return {
          key: issue.key,
          summary: issue.fields.summary,
          issueType: issue.fields.issuetype?.name || null,
          status: issue.fields.status?.name || null,
          assignee: issue.fields.assignee?.displayName || null,
          storyPoints: storyPoints,
          activityType: issue.fields.customfield_12320040?.value || null,
          resolution: issue.fields.resolution?.name || null,
          resolutionDate: issue.fields.resolutiondate || null,
          url: `${jiraHost}/browse/${issue.key}`
        };
      }));

      startAt += maxResults;
    }

    return issues;
  }

  return { fetchBoards, fetchSprints, fetchSprintIssues, fetchBoardConfiguration, fetchFilterJql, fetchIssuesByJql };
}

module.exports = { createJiraClient };
