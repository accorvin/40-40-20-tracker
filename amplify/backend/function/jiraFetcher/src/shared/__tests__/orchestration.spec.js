// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { discoverBoards, performRefresh } from '../orchestration.js';

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
        { key: 'P-1', summary: 'Bug', activityType: 'Tech Debt & Quality', storyPoints: 3, resolution: { name: 'Done' } }
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
