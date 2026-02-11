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

module.exports = {
  STALE_THRESHOLD_MS,
  classifyIssue,
  buildSprintSummary,
  getLatestSprintEndDate,
  determineStaleness
};
