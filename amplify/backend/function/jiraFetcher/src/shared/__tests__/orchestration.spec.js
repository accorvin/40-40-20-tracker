// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { discoverBoards, performRefresh, processBoard, performMultiProjectRefresh } from '../orchestration.js';

function makeDeps(overrides = {}) {
  return {
    projectKey: 'PROJ',
    fetchBoards: vi.fn().mockResolvedValue([]),
    fetchSprints: vi.fn().mockResolvedValue([]),
    fetchSprintIssues: vi.fn().mockResolvedValue([]),
    readStorage: vi.fn().mockReturnValue(null),
    writeStorage: vi.fn(),
    ...overrides
  };
}

describe('discoverBoards', () => {
  it('saves boards.json and teams.json', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'RHOAIENG - Team Alpha' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { state: 'active', completeDate: null, endDate: '2025-06-15' }
      ])
    });

    const result = await discoverBoards(deps);

    expect(result.success).toBe(true);
    expect(result.boardCount).toBe(1);

    // boards.json written
    const boardsCall = deps.writeStorage.mock.calls.find(c => c[0] === 'boards.json');
    expect(boardsCall).toBeDefined();
    expect(boardsCall[1].boards).toHaveLength(1);

    // teams.json written
    const teamsCall = deps.writeStorage.mock.calls.find(c => c[0] === 'teams.json');
    expect(teamsCall).toBeDefined();
    const team = teamsCall[1].teams[0];
    expect(team.boardId).toBe(1);
    expect(team.displayName).toBe('Team Alpha');
    expect(team.enabled).toBe(true);
    expect(team.stale).toBe(false);
  });

  it('marks stale boards as disabled', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'RHOAIENG - Stale Team' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { state: 'closed', completeDate: '2024-01-01T00:00:00Z', endDate: null }
      ])
    });

    const result = await discoverBoards(deps);

    expect(result.staleCount).toBe(1);
    const teamsCall = deps.writeStorage.mock.calls.find(c => c[0] === 'teams.json');
    expect(teamsCall[1].teams[0].enabled).toBe(false);
    expect(teamsCall[1].teams[0].stale).toBe(true);
  });

  it('preserves existing team config for known boards', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'RHOAIENG - Team Alpha' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { state: 'active', completeDate: null, endDate: '2025-06-15' }
      ]),
      readStorage: vi.fn().mockReturnValue({
        teams: [{
          boardId: 1,
          boardName: 'RHOAIENG - Team Alpha',
          displayName: 'Custom Name',
          enabled: true,
          manuallyConfigured: true
        }]
      })
    });

    await discoverBoards(deps);

    const teamsCall = deps.writeStorage.mock.calls.find(c => c[0] === 'teams.json');
    expect(teamsCall[1].teams[0].displayName).toBe('Custom Name');
    expect(teamsCall[1].teams[0].manuallyConfigured).toBe(true);
  });

  it('does not auto-disable stale boards that are manually configured', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'RHOAIENG - Team Alpha' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([]),
      readStorage: vi.fn().mockReturnValue({
        teams: [{
          boardId: 1,
          boardName: 'RHOAIENG - Team Alpha',
          displayName: 'Team Alpha',
          enabled: true,
          manuallyConfigured: true
        }]
      })
    });

    await discoverBoards(deps);

    const teamsCall = deps.writeStorage.mock.calls.find(c => c[0] === 'teams.json');
    // Should stay enabled because manuallyConfigured is true
    expect(teamsCall[1].teams[0].enabled).toBe(true);
    expect(teamsCall[1].teams[0].stale).toBe(true);
  });

  it('handles sprint fetch errors gracefully', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'Board A' }
      ]),
      fetchSprints: vi.fn().mockRejectedValue(new Error('Network error'))
    });

    const result = await discoverBoards(deps);

    expect(result.success).toBe(true);
    // Board should not be stale on error
    const teamsCall = deps.writeStorage.mock.calls.find(c => c[0] === 'teams.json');
    expect(teamsCall[1].teams[0].stale).toBe(false);
  });
});

describe('performRefresh', () => {
  it('processes enabled boards and generates dashboard summary', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'Board A' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
      ]),
      fetchSprintIssues: vi.fn().mockResolvedValue([
        { key: 'P-1', summary: 'Bug', issueType: 'Bug', activityType: 'Tech Debt & Quality', storyPoints: 3, resolution: { name: 'Done' } }
      ]),
      readStorage: vi.fn().mockReturnValue(null)
    });

    const result = await performRefresh({ ...deps, hardRefresh: false });

    expect(result.success).toBe(true);
    expect(result.boardCount).toBe(1);
    expect(result.sprintCount).toBe(1);

    // Sprint data written
    const sprintCall = deps.writeStorage.mock.calls.find(c => c[0] === 'sprints/100.json');
    expect(sprintCall).toBeDefined();
    expect(sprintCall[1].issues[0].bucket).toBe('tech-debt-quality');

    // Dashboard summary written
    const dashCall = deps.writeStorage.mock.calls.find(c => c[0] === 'dashboard-summary.json');
    expect(dashCall).toBeDefined();
    expect(dashCall[1].boards[1]).toBeDefined();
  });

  it('skips disabled boards', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'Enabled Board' },
        { id: 2, name: 'Disabled Board' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
      ]),
      fetchSprintIssues: vi.fn().mockResolvedValue([]),
      readStorage: vi.fn().mockImplementation((key) => {
        if (key === 'teams.json') {
          return {
            teams: [
              { boardId: 1, enabled: true },
              { boardId: 2, enabled: false }
            ]
          };
        }
        return null;
      })
    });

    const result = await performRefresh({ ...deps, hardRefresh: false });

    expect(result.boardCount).toBe(1);
    // fetchSprints should only be called for board 1
    expect(deps.fetchSprints).toHaveBeenCalledTimes(1);
    expect(deps.fetchSprints).toHaveBeenCalledWith(1);
  });

  it('uses cached data for closed sprints when not hard refresh', async () => {
    const cachedSprint = {
      issues: [{ key: 'P-1' }],
      summary: { totalPoints: 5, buckets: {} }
    };

    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'Board A' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { id: 100, name: 'Sprint 1', state: 'closed', startDate: '2025-05-01', endDate: '2025-05-14', completeDate: '2025-05-15' }
      ]),
      readStorage: vi.fn().mockImplementation((key) => {
        if (key === 'sprints/100.json') return cachedSprint;
        return null;
      })
    });

    await performRefresh({ ...deps, hardRefresh: false });

    // Should NOT call fetchSprintIssues since sprint is cached
    expect(deps.fetchSprintIssues).not.toHaveBeenCalled();
  });

  it('re-fetches closed sprints on hard refresh', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'Board A' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { id: 100, name: 'Sprint 1', state: 'closed', startDate: '2025-05-01', endDate: '2025-05-14', completeDate: '2025-05-15' }
      ]),
      fetchSprintIssues: vi.fn().mockResolvedValue([]),
      readStorage: vi.fn().mockImplementation((key) => {
        if (key === 'sprints/100.json') return { issues: [], summary: {} };
        return null;
      })
    });

    await performRefresh({ ...deps, hardRefresh: true });

    expect(deps.fetchSprintIssues).toHaveBeenCalledWith(100);
  });

  it('auto-generates teams.json if missing', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'RHOAIENG - Team A' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([]),
      readStorage: vi.fn().mockReturnValue(null)
    });

    await performRefresh({ ...deps, hardRefresh: false });

    const teamsCall = deps.writeStorage.mock.calls.find(c => c[0] === 'teams.json');
    expect(teamsCall).toBeDefined();
    expect(teamsCall[1].teams[0].displayName).toBe('Team A');
  });

  it('writes board sprint index', async () => {
    const deps = makeDeps({
      fetchBoards: vi.fn().mockResolvedValue([
        { id: 1, name: 'Board A' }
      ]),
      fetchSprints: vi.fn().mockResolvedValue([
        { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
      ]),
      fetchSprintIssues: vi.fn().mockResolvedValue([])
    });

    await performRefresh({ ...deps, hardRefresh: false });

    const indexCall = deps.writeStorage.mock.calls.find(c => c[0] === 'sprints/board-1.json');
    expect(indexCall).toBeDefined();
    expect(indexCall[1].sprints).toHaveLength(1);
    expect(indexCall[1].sprints[0].id).toBe(100);
  });
});

describe('processBoard', () => {
  it('processes a single board and returns dashboard sprint result', async () => {
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();
    const fetchSprints = vi.fn().mockResolvedValue([
      { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
    ]);
    const fetchSprintIssues = vi.fn().mockResolvedValue([
      { key: 'P-1', summary: 'Bug', issueType: 'Bug', activityType: 'Tech Debt & Quality', storyPoints: 3, resolution: { name: 'Done' } }
    ]);

    const result = await processBoard({
      board: { id: 1, name: 'Board A' },
      hardRefresh: false,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    expect(result.board.id).toBe(1);
    expect(result.sprintResults).toHaveLength(1);
    expect(result.dashboardSprint).toBeDefined();
    expect(result.dashboardSprintResult.summary.totalPoints).toBe(3);

    // Sprint data written
    const sprintCall = writeStorage.mock.calls.find(c => c[0] === 'sprints/100.json');
    expect(sprintCall).toBeDefined();
  });

  it('filters out Sub-task issue types', async () => {
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();
    const fetchSprints = vi.fn().mockResolvedValue([
      { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
    ]);
    const fetchSprintIssues = vi.fn().mockResolvedValue([
      { key: 'P-1', summary: 'Task', issueType: 'Task', activityType: 'New Features', storyPoints: 5, resolution: null },
      { key: 'P-2', summary: 'Subtask', issueType: 'Sub-task', activityType: 'New Features', storyPoints: 2, resolution: null },
      { key: 'P-3', summary: 'Bug', issueType: 'Bug', activityType: 'Tech Debt & Quality', storyPoints: 3, resolution: null }
    ]);

    const result = await processBoard({
      board: { id: 1, name: 'Board A' },
      hardRefresh: false,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    // Only 2 issues should be processed (Sub-task excluded)
    expect(result.dashboardSprintResult.summary.totalPoints).toBe(8);
    expect(result.dashboardSprintResult.issueCount).toBe(2);

    const sprintCall = writeStorage.mock.calls.find(c => c[0] === 'sprints/100.json');
    expect(sprintCall[1].issues).toHaveLength(2);
    expect(sprintCall[1].issues.find(i => i.issueType === 'Sub-task')).toBeUndefined();
  });

  it('filters out Epic and Initiative issue types', async () => {
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();
    const fetchSprints = vi.fn().mockResolvedValue([
      { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
    ]);
    const fetchSprintIssues = vi.fn().mockResolvedValue([
      { key: 'P-1', summary: 'Story', issueType: 'Story', activityType: 'New Features', storyPoints: 5, resolution: null },
      { key: 'P-2', summary: 'Epic', issueType: 'Epic', activityType: 'New Features', storyPoints: 50, resolution: null },
      { key: 'P-3', summary: 'Initiative', issueType: 'Initiative', activityType: 'New Features', storyPoints: 100, resolution: null }
    ]);

    const result = await processBoard({
      board: { id: 1, name: 'Board A' },
      hardRefresh: false,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    // Only Story should be processed
    expect(result.dashboardSprintResult.summary.totalPoints).toBe(5);
    expect(result.dashboardSprintResult.issueCount).toBe(1);

    const sprintCall = writeStorage.mock.calls.find(c => c[0] === 'sprints/100.json');
    expect(sprintCall[1].issues).toHaveLength(1);
    expect(sprintCall[1].issues[0].issueType).toBe('Story');
  });

  it('includes all allowed issue types', async () => {
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();
    const fetchSprints = vi.fn().mockResolvedValue([
      { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
    ]);
    const fetchSprintIssues = vi.fn().mockResolvedValue([
      { key: 'P-1', summary: 'Bug', issueType: 'Bug', activityType: 'Tech Debt & Quality', storyPoints: 1, resolution: null },
      { key: 'P-2', summary: 'Task', issueType: 'Task', activityType: 'New Features', storyPoints: 2, resolution: null },
      { key: 'P-3', summary: 'Story', issueType: 'Story', activityType: 'New Features', storyPoints: 3, resolution: null },
      { key: 'P-4', summary: 'Spike', issueType: 'Spike', activityType: 'Learning & Enablement', storyPoints: 4, resolution: null },
      { key: 'P-5', summary: 'Vuln', issueType: 'Vulnerability', activityType: 'Tech Debt & Quality', storyPoints: 5, resolution: null },
      { key: 'P-6', summary: 'Weak', issueType: 'Weakness', activityType: 'Tech Debt & Quality', storyPoints: 6, resolution: null }
    ]);

    const result = await processBoard({
      board: { id: 1, name: 'Board A' },
      hardRefresh: false,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    // All 6 allowed types should be included
    expect(result.dashboardSprintResult.summary.totalPoints).toBe(21);
    expect(result.dashboardSprintResult.issueCount).toBe(6);

    const sprintCall = writeStorage.mock.calls.find(c => c[0] === 'sprints/100.json');
    expect(sprintCall[1].issues).toHaveLength(6);
  });

  it('uses cached closed sprint data when not hard refresh', async () => {
    const cachedSprint = {
      issues: [{ key: 'P-1' }],
      summary: { totalPoints: 5, buckets: {} }
    };
    const readStorage = vi.fn().mockImplementation((key) => {
      if (key === 'sprints/100.json') return cachedSprint;
      return null;
    });
    const writeStorage = vi.fn();
    const fetchSprints = vi.fn().mockResolvedValue([
      { id: 100, name: 'Sprint 1', state: 'closed', startDate: '2025-05-01', endDate: '2025-05-14', completeDate: '2025-05-15' }
    ]);
    const fetchSprintIssues = vi.fn();

    await processBoard({
      board: { id: 1, name: 'Board A' },
      hardRefresh: false,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    expect(fetchSprintIssues).not.toHaveBeenCalled();
  });
});

describe('performMultiProjectRefresh', () => {
  it('processes multiple projects and writes rollup summaries', async () => {
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();
    const fetchBoards = vi.fn().mockResolvedValue([
      { id: 1, name: 'Board A' }
    ]);
    const fetchSprints = vi.fn().mockResolvedValue([
      { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
    ]);
    const fetchSprintIssues = vi.fn().mockResolvedValue([
      { key: 'P-1', summary: 'Bug', issueType: 'Bug', activityType: 'Tech Debt & Quality', storyPoints: 3, resolution: null }
    ]);

    const result = await performMultiProjectRefresh({
      projects: [
        { key: 'PROJ1', name: 'Project 1' },
        { key: 'PROJ2', name: 'Project 2' }
      ],
      hardRefresh: false,
      fetchBoards,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    expect(result.success).toBe(true);
    expect(result.projects).toHaveLength(2);

    // Each project writes its data with prefixed keys
    const proj1BoardsCall = writeStorage.mock.calls.find(c => c[0] === 'data/PROJ1/boards.json');
    expect(proj1BoardsCall).toBeDefined();
    const proj2BoardsCall = writeStorage.mock.calls.find(c => c[0] === 'data/PROJ2/boards.json');
    expect(proj2BoardsCall).toBeDefined();

    // Org summary written
    const orgSummaryCall = writeStorage.mock.calls.find(c => c[0] === 'data/org-summary.json');
    expect(orgSummaryCall).toBeDefined();
    expect(orgSummaryCall[1].projectCount).toBe(2);
  });

  it('writes per-project summary files', async () => {
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();
    const fetchBoards = vi.fn().mockResolvedValue([
      { id: 1, name: 'Board A' }
    ]);
    const fetchSprints = vi.fn().mockResolvedValue([
      { id: 100, name: 'Sprint 1', state: 'active', startDate: '2025-06-01', endDate: '2025-06-14', completeDate: null }
    ]);
    const fetchSprintIssues = vi.fn().mockResolvedValue([
      { key: 'P-1', summary: 'Feature', issueType: 'Story', activityType: 'New Features', storyPoints: 5, resolution: null }
    ]);

    await performMultiProjectRefresh({
      projects: [{ key: 'PROJ1', name: 'Project 1' }],
      hardRefresh: false,
      fetchBoards,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    // Project-level dashboard summary written
    const projSummaryCall = writeStorage.mock.calls.find(c => c[0] === 'data/PROJ1/dashboard-summary.json');
    expect(projSummaryCall).toBeDefined();
    expect(projSummaryCall[1].boards).toBeDefined();
  });

  it('continues processing if one project fails', async () => {
    let callCount = 0;
    const fetchBoards = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('Jira error');
      return [{ id: 1, name: 'Board A' }];
    });
    const readStorage = vi.fn().mockReturnValue(null);
    const writeStorage = vi.fn();
    const fetchSprints = vi.fn().mockResolvedValue([]);
    const fetchSprintIssues = vi.fn().mockResolvedValue([]);

    const result = await performMultiProjectRefresh({
      projects: [
        { key: 'FAIL_PROJ', name: 'Will Fail' },
        { key: 'OK_PROJ', name: 'Will Succeed' }
      ],
      hardRefresh: false,
      fetchBoards,
      fetchSprints,
      fetchSprintIssues,
      readStorage,
      writeStorage
    });

    expect(result.success).toBe(true);
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0].success).toBe(false);
    expect(result.projects[1].success).toBe(true);
  });
});
