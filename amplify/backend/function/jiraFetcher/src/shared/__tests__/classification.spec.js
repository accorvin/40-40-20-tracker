// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  classifyIssue,
  buildSprintSummary,
  buildProjectSummary,
  buildOrgSummary,
  getLatestSprintEndDate,
  determineStaleness,
  STALE_THRESHOLD_MS
} from '../classification.js';

describe('classifyIssue', () => {
  it('classifies Tech Debt & Quality', () => {
    expect(classifyIssue({ activityType: 'Tech Debt & Quality' })).toBe('tech-debt-quality');
  });

  it('classifies New Features', () => {
    expect(classifyIssue({ activityType: 'New Features' })).toBe('new-features');
  });

  it('classifies Learning & Enablement', () => {
    expect(classifyIssue({ activityType: 'Learning & Enablement' })).toBe('learning-enablement');
  });

  it('classifies null activityType as uncategorized', () => {
    expect(classifyIssue({ activityType: null })).toBe('uncategorized');
  });

  it('classifies undefined activityType as uncategorized', () => {
    expect(classifyIssue({})).toBe('uncategorized');
  });

  it('classifies unknown activityType as uncategorized', () => {
    expect(classifyIssue({ activityType: 'Something Else' })).toBe('uncategorized');
  });
});

describe('buildSprintSummary', () => {
  it('returns zeroed summary for empty issues array', () => {
    const summary = buildSprintSummary([]);
    expect(summary.totalPoints).toBe(0);
    expect(summary.estimatedIssueCount).toBe(0);
    expect(summary.unestimatedIssueCount).toBe(0);
    expect(summary.buckets['tech-debt-quality'].points).toBe(0);
    expect(summary.buckets['new-features'].points).toBe(0);
    expect(summary.buckets['learning-enablement'].points).toBe(0);
    expect(summary.buckets['uncategorized'].points).toBe(0);
  });

  it('sums points into correct buckets', () => {
    const issues = [
      { bucket: 'tech-debt-quality', storyPoints: 3, completed: false },
      { bucket: 'tech-debt-quality', storyPoints: 5, completed: true },
      { bucket: 'new-features', storyPoints: 8, completed: false },
      { bucket: 'uncategorized', storyPoints: 2, completed: true }
    ];

    const summary = buildSprintSummary(issues);
    expect(summary.totalPoints).toBe(18);
    expect(summary.estimatedIssueCount).toBe(4);
    expect(summary.unestimatedIssueCount).toBe(0);
    expect(summary.buckets['tech-debt-quality'].points).toBe(8);
    expect(summary.buckets['tech-debt-quality'].completedPoints).toBe(5);
    expect(summary.buckets['new-features'].points).toBe(8);
    expect(summary.buckets['uncategorized'].points).toBe(2);
  });

  it('tracks unestimated issues', () => {
    const issues = [
      { bucket: 'new-features', storyPoints: 5, completed: false },
      { bucket: 'new-features', storyPoints: null, completed: false },
      { bucket: 'tech-debt-quality', storyPoints: undefined, completed: false }
    ];

    const summary = buildSprintSummary(issues);
    expect(summary.estimatedIssueCount).toBe(1);
    expect(summary.unestimatedIssueCount).toBe(2);
    expect(summary.totalPoints).toBe(5);
  });

  it('tracks completed points separately', () => {
    const issues = [
      { bucket: 'new-features', storyPoints: 5, completed: true },
      { bucket: 'new-features', storyPoints: 3, completed: false }
    ];

    const summary = buildSprintSummary(issues);
    expect(summary.buckets['new-features'].completedPoints).toBe(5);
    expect(summary.buckets['new-features'].points).toBe(8);
  });

  it('counts issueCount per bucket', () => {
    const issues = [
      { bucket: 'tech-debt-quality', storyPoints: 1, completed: false },
      { bucket: 'tech-debt-quality', storyPoints: 2, completed: false },
      { bucket: 'new-features', storyPoints: 3, completed: false }
    ];

    const summary = buildSprintSummary(issues);
    expect(summary.buckets['tech-debt-quality'].issueCount).toBe(2);
    expect(summary.buckets['new-features'].issueCount).toBe(1);
  });

  it('ignores issues with unknown bucket', () => {
    const issues = [
      { bucket: 'unknown-bucket', storyPoints: 10, completed: false }
    ];

    const summary = buildSprintSummary(issues);
    expect(summary.totalPoints).toBe(0);
  });
});

describe('getLatestSprintEndDate', () => {
  it('returns null for empty array', () => {
    expect(getLatestSprintEndDate([])).toBeNull();
  });

  it('returns null when no sprints have dates', () => {
    expect(getLatestSprintEndDate([
      { completeDate: null, endDate: null }
    ])).toBeNull();
  });

  it('prefers completeDate over endDate', () => {
    const sprints = [
      { completeDate: '2025-03-15T00:00:00Z', endDate: '2025-03-10T00:00:00Z' }
    ];
    expect(getLatestSprintEndDate(sprints)).toBe('2025-03-15T00:00:00Z');
  });

  it('falls back to endDate when completeDate is null', () => {
    const sprints = [
      { completeDate: null, endDate: '2025-03-10T00:00:00Z' }
    ];
    expect(getLatestSprintEndDate(sprints)).toBe('2025-03-10T00:00:00Z');
  });

  it('returns the latest date among multiple sprints', () => {
    const sprints = [
      { completeDate: '2025-01-01T00:00:00Z', endDate: null },
      { completeDate: '2025-06-01T00:00:00Z', endDate: null },
      { completeDate: '2025-03-01T00:00:00Z', endDate: null }
    ];
    expect(getLatestSprintEndDate(sprints)).toBe('2025-06-01T00:00:00Z');
  });

  it('skips invalid dates', () => {
    const sprints = [
      { completeDate: 'not-a-date', endDate: null },
      { completeDate: '2025-05-01T00:00:00Z', endDate: null }
    ];
    expect(getLatestSprintEndDate(sprints)).toBe('2025-05-01T00:00:00Z');
  });
});

describe('determineStaleness', () => {
  const now = new Date('2025-06-01T00:00:00Z');

  it('marks board with no sprints as stale', () => {
    const result = determineStaleness([], now);
    expect(result.stale).toBe(true);
    expect(result.lastSprintEndDate).toBeNull();
  });

  it('marks null sprints as stale', () => {
    const result = determineStaleness(null, now);
    expect(result.stale).toBe(true);
    expect(result.lastSprintEndDate).toBeNull();
  });

  it('marks board with active sprint as not stale', () => {
    const sprints = [
      { state: 'active', completeDate: null, endDate: '2025-06-15T00:00:00Z' }
    ];
    const result = determineStaleness(sprints, now);
    expect(result.stale).toBe(false);
  });

  it('marks board with future sprint as not stale', () => {
    const sprints = [
      { state: 'future', completeDate: null, endDate: '2025-07-01T00:00:00Z' }
    ];
    const result = determineStaleness(sprints, now);
    expect(result.stale).toBe(false);
  });

  it('marks board as stale when last sprint ended >90 days ago', () => {
    const sprints = [
      { state: 'closed', completeDate: '2025-01-01T00:00:00Z', endDate: null }
    ];
    const result = determineStaleness(sprints, now);
    expect(result.stale).toBe(true);
    expect(result.lastSprintEndDate).toBe('2025-01-01T00:00:00Z');
  });

  it('marks board as not stale when last sprint ended <90 days ago', () => {
    const sprints = [
      { state: 'closed', completeDate: '2025-05-01T00:00:00Z', endDate: null }
    ];
    const result = determineStaleness(sprints, now);
    expect(result.stale).toBe(false);
    expect(result.lastSprintEndDate).toBe('2025-05-01T00:00:00Z');
  });

  it('marks board as stale when closed sprints have no dates', () => {
    const sprints = [
      { state: 'closed', completeDate: null, endDate: null }
    ];
    const result = determineStaleness(sprints, now);
    expect(result.stale).toBe(true);
    expect(result.lastSprintEndDate).toBeNull();
  });
});

describe('STALE_THRESHOLD_MS', () => {
  it('is 90 days in milliseconds', () => {
    expect(STALE_THRESHOLD_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe('buildProjectSummary', () => {
  function makeBoardSummary(overrides = {}) {
    return {
      totalPoints: 10,
      estimatedIssueCount: 5,
      unestimatedIssueCount: 1,
      buckets: {
        'tech-debt-quality': { points: 4, issueCount: 2, completedPoints: 3 },
        'new-features': { points: 4, issueCount: 2, completedPoints: 2 },
        'learning-enablement': { points: 1, issueCount: 1, completedPoints: 0 },
        'uncategorized': { points: 1, issueCount: 0, completedPoints: 0 }
      },
      ...overrides
    };
  }

  it('returns zeroed summary for empty array', () => {
    const result = buildProjectSummary([]);
    expect(result.totalPoints).toBe(0);
    expect(result.boardCount).toBe(0);
    expect(result.buckets['tech-debt-quality'].points).toBe(0);
  });

  it('aggregates points across boards', () => {
    const summaries = [
      makeBoardSummary({ totalPoints: 10 }),
      makeBoardSummary({ totalPoints: 20 })
    ];
    // Override second summary buckets to different values
    summaries[1].buckets['tech-debt-quality'].points = 8;
    summaries[1].buckets['new-features'].points = 8;
    summaries[1].buckets['learning-enablement'].points = 2;
    summaries[1].buckets['uncategorized'].points = 2;

    const result = buildProjectSummary(summaries);
    expect(result.totalPoints).toBe(30);
    expect(result.boardCount).toBe(2);
    expect(result.buckets['tech-debt-quality'].points).toBe(12);
    expect(result.buckets['new-features'].points).toBe(12);
    expect(result.buckets['learning-enablement'].points).toBe(3);
    expect(result.buckets['uncategorized'].points).toBe(3);
  });

  it('aggregates issue counts and completed points', () => {
    const summaries = [makeBoardSummary(), makeBoardSummary()];

    const result = buildProjectSummary(summaries);
    expect(result.estimatedIssueCount).toBe(10);
    expect(result.unestimatedIssueCount).toBe(2);
    expect(result.buckets['tech-debt-quality'].completedPoints).toBe(6);
    expect(result.buckets['tech-debt-quality'].issueCount).toBe(4);
  });

  it('works with a single board', () => {
    const result = buildProjectSummary([makeBoardSummary()]);
    expect(result.totalPoints).toBe(10);
    expect(result.boardCount).toBe(1);
  });
});

describe('buildOrgSummary', () => {
  function makeProjectSummary(overrides = {}) {
    return {
      totalPoints: 20,
      boardCount: 3,
      estimatedIssueCount: 10,
      unestimatedIssueCount: 2,
      buckets: {
        'tech-debt-quality': { points: 8, issueCount: 4, completedPoints: 6 },
        'new-features': { points: 8, issueCount: 4, completedPoints: 4 },
        'learning-enablement': { points: 2, issueCount: 2, completedPoints: 0 },
        'uncategorized': { points: 2, issueCount: 0, completedPoints: 0 }
      },
      ...overrides
    };
  }

  it('returns zeroed summary for empty array', () => {
    const result = buildOrgSummary([]);
    expect(result.totalPoints).toBe(0);
    expect(result.projectCount).toBe(0);
    expect(result.boardCount).toBe(0);
  });

  it('aggregates across projects', () => {
    const projects = [
      makeProjectSummary({ totalPoints: 20, boardCount: 3 }),
      makeProjectSummary({ totalPoints: 30, boardCount: 5 })
    ];
    projects[1].buckets['tech-debt-quality'].points = 12;
    projects[1].buckets['new-features'].points = 12;
    projects[1].buckets['learning-enablement'].points = 3;
    projects[1].buckets['uncategorized'].points = 3;

    const result = buildOrgSummary(projects);
    expect(result.totalPoints).toBe(50);
    expect(result.projectCount).toBe(2);
    expect(result.boardCount).toBe(8);
    expect(result.buckets['tech-debt-quality'].points).toBe(20);
    expect(result.buckets['new-features'].points).toBe(20);
  });

  it('sums estimatedIssueCount and unestimatedIssueCount', () => {
    const projects = [makeProjectSummary(), makeProjectSummary()];

    const result = buildOrgSummary(projects);
    expect(result.estimatedIssueCount).toBe(20);
    expect(result.unestimatedIssueCount).toBe(4);
  });
});
