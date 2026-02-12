/**
 * Pure business logic for 40-40-20 issue classification and sprint summarization.
 * No I/O dependencies — safe to use in Lambda, dev server, or tests.
 */

/**
 * Staleness threshold: 90 days in milliseconds
 */
const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Classify an issue into a 40-40-20 bucket based on Activity Type custom field
 */
function classifyIssue(issue) {
  switch (issue.activityType) {
    case 'Tech Debt & Quality':
      return 'tech-debt-quality';
    case 'New Features':
      return 'new-features';
    case 'Learning & Enablement':
      return 'learning-enablement';
    default:
      return 'uncategorized';
  }
}

/**
 * Build sprint summary from classified issues
 */
function buildSprintSummary(issues) {
  const buckets = {
    'tech-debt-quality': { points: 0, issueCount: 0, completedPoints: 0 },
    'new-features': { points: 0, issueCount: 0, completedPoints: 0 },
    'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
    'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
  };

  let totalPoints = 0;
  let estimatedIssueCount = 0;
  let unestimatedIssueCount = 0;

  issues.forEach(issue => {
    const bucket = buckets[issue.bucket];
    if (!bucket) return;

    bucket.issueCount++;

    if (issue.storyPoints != null) {
      bucket.points += issue.storyPoints;
      totalPoints += issue.storyPoints;
      estimatedIssueCount++;

      if (issue.completed) {
        bucket.completedPoints += issue.storyPoints;
      }
    } else {
      unestimatedIssueCount++;
    }
  });

  return {
    totalPoints,
    estimatedIssueCount,
    unestimatedIssueCount,
    buckets
  };
}

/**
 * Find the most recent end date among a list of sprints.
 * Prefers completeDate for closed sprints, falls back to endDate.
 * @param {Array} sprints
 * @returns {string|null} ISO date string or null
 */
function getLatestSprintEndDate(sprints) {
  let latest = null;

  for (const sprint of sprints) {
    const dateStr = sprint.completeDate || sprint.endDate;
    if (!dateStr) continue;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    if (!latest || date > new Date(latest)) {
      latest = dateStr;
    }
  }

  return latest;
}

/**
 * Determine whether a board is stale based on its sprints.
 *
 * A board is stale if:
 * - It has no sprints at all, OR
 * - It has no active/future sprints AND its most recent closed sprint
 *   ended more than 3 months ago.
 *
 * @param {Array} sprints - Sprint objects with state, completeDate, endDate
 * @param {Date} [now=new Date()] - Current date (injectable for testing)
 * @returns {{ stale: boolean, lastSprintEndDate: string|null }}
 */
function determineStaleness(sprints, now = new Date()) {
  if (!sprints || sprints.length === 0) {
    return { stale: true, lastSprintEndDate: null };
  }

  const hasActiveOrFuture = sprints.some(
    s => s.state === 'active' || s.state === 'future'
  );

  if (hasActiveOrFuture) {
    return { stale: false, lastSprintEndDate: getLatestSprintEndDate(sprints) };
  }

  const lastSprintEndDate = getLatestSprintEndDate(sprints);

  if (!lastSprintEndDate) {
    return { stale: true, lastSprintEndDate: null };
  }

  const elapsed = now.getTime() - new Date(lastSprintEndDate).getTime();
  return { stale: elapsed > STALE_THRESHOLD_MS, lastSprintEndDate };
}

/**
 * Create a zeroed buckets object.
 */
function emptyBuckets() {
  return {
    'tech-debt-quality': { points: 0, issueCount: 0, completedPoints: 0 },
    'new-features': { points: 0, issueCount: 0, completedPoints: 0 },
    'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
    'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
  };
}

/**
 * Aggregate bucket data from a source summary into a target buckets object (mutates target).
 */
function addBuckets(target, source) {
  for (const key of Object.keys(target)) {
    const s = source[key];
    if (!s) continue;
    target[key].points += s.points || 0;
    target[key].issueCount += s.issueCount || 0;
    target[key].completedPoints += s.completedPoints || 0;
  }
}

/**
 * Build a project-level summary by aggregating across board summaries.
 * @param {Array} boardSummaries - Array of sprint summary objects (from buildSprintSummary)
 * @returns {object} Aggregated summary with totalPoints, boardCount, buckets, etc.
 */
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

/**
 * Build an org-level summary by aggregating across project summaries.
 * @param {Array} projectSummaries - Array of project summary objects (from buildProjectSummary)
 * @returns {object} Aggregated summary with totalPoints, projectCount, boardCount, buckets, etc.
 */
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

module.exports = {
  STALE_THRESHOLD_MS,
  classifyIssue,
  buildSprintSummary,
  buildProjectSummary,
  buildOrgSummary,
  getLatestSprintEndDate,
  determineStaleness
};
