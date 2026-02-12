/**
 * Orchestration logic for board discovery and sprint refresh.
 *
 * All I/O is injected via dependencies — this module never touches
 * S3, the filesystem, or the network directly.
 */

const { classifyIssue, buildSprintSummary, buildProjectSummary, buildOrgSummary, determineStaleness } = require('./classification');
const { getStoragePrefix, createPrefixedStorage } = require('./config');

/**
 * Discover boards from Jira, determine staleness, and merge with existing team config.
 *
 * @param {object} deps
 * @param {string} deps.projectKey
 * @param {function} deps.fetchBoards - (projectKey) => Promise<Board[]>
 * @param {function} deps.fetchSprints - (boardId) => Promise<Sprint[]>
 * @param {function} deps.readStorage - (key) => data | null
 * @param {function} deps.writeStorage - (key, data) => void
 * @returns {Promise<{ success: boolean, boardCount: number, staleCount: number }>}
 */
async function discoverBoards({ projectKey, fetchBoards, fetchSprints, readStorage, writeStorage }) {
  console.log(`Discovering boards for project ${projectKey}`);

  const boards = await fetchBoards(projectKey);
  console.log(`Found ${boards.length} scrum boards`);

  await writeStorage('boards.json', {
    lastUpdated: new Date().toISOString(),
    boards: boards
  });

  // Fetch sprints for each board to determine staleness
  const DISCOVER_CONCURRENCY = 3;
  const boardStaleness = new Map();

  for (let i = 0; i < boards.length; i += DISCOVER_CONCURRENCY) {
    const chunk = boards.slice(i, i + DISCOVER_CONCURRENCY);
    const results = await Promise.all(chunk.map(async (board) => {
      try {
        const sprints = await fetchSprints(board.id);
        return { boardId: board.id, ...determineStaleness(sprints) };
      } catch (error) {
        console.warn(`Failed to fetch sprints for board ${board.id}, marking as not stale:`, error.message);
        return { boardId: board.id, stale: false, lastSprintEndDate: null };
      }
    }));
    results.forEach(r => boardStaleness.set(r.boardId, r));
  }

  const staleCount = [...boardStaleness.values()].filter(s => s.stale).length;
  console.log(`Staleness check: ${staleCount} of ${boards.length} boards are stale`);

  // Merge with existing teams config (preserve enabled/disabled state + manual overrides)
  const existingTeams = await readStorage('teams.json');
  const existingMap = existingTeams?.teams
    ? new Map(existingTeams.teams.map(t => [t.boardId, t]))
    : new Map();

  const mergedTeams = boards.map(b => {
    const staleness = boardStaleness.get(b.id) || { stale: false, lastSprintEndDate: null };
    const existing = existingMap.get(b.id);

    if (existing) {
      // Existing board: update staleness fields, auto-disable only if stale and not manually configured
      const updated = {
        ...existing,
        boardName: b.name,
        stale: staleness.stale,
        lastSprintEndDate: staleness.lastSprintEndDate
      };
      if (staleness.stale && !existing.manuallyConfigured) {
        updated.enabled = false;
      }
      return updated;
    }

    // New board: auto-set enabled based on staleness
    return {
      boardId: b.id,
      boardName: b.name,
      displayName: b.name.replace(/^RHOAIENG\s*[-–]\s*/, ''),
      enabled: !staleness.stale,
      stale: staleness.stale,
      lastSprintEndDate: staleness.lastSprintEndDate,
      manuallyConfigured: false
    };
  });

  await writeStorage('teams.json', { teams: mergedTeams });

  return { success: true, boardCount: boards.length, staleCount };
}

/**
 * Process a single board: fetch sprints and issues, classify, write to storage.
 *
 * This is the unit of work that can be called independently (e.g., from an SQS worker)
 * or as part of a larger refresh.
 *
 * @param {object} deps
 * @param {object} deps.board - { id, name }
 * @param {boolean} deps.hardRefresh
 * @param {function} deps.fetchSprints - (boardId) => Promise<Sprint[]>
 * @param {function} deps.fetchSprintIssues - (sprintId) => Promise<Issue[]>
 * @param {function} deps.readStorage - (key) => data | null
 * @param {function} deps.writeStorage - (key, data) => void
 * @returns {Promise<{ board, sprintResults, dashboardSprint, dashboardSprintResult }>}
 */
async function processBoard({ board, hardRefresh, fetchSprints, fetchSprintIssues, readStorage, writeStorage }) {
  console.log(`Processing board: ${board.name} (${board.id})`);

  const sprints = await fetchSprints(board.id);
  console.log(`  [${board.name}] Found ${sprints.length} sprints`);

  const activeSprints = sprints.filter(s => s.state === 'active');
  const futureSprints = sprints.filter(s => s.state === 'future');
  const closedSprints = sprints
    .filter(s => s.state === 'closed')
    .sort((a, b) => new Date(b.completeDate || 0) - new Date(a.completeDate || 0))
    .slice(0, 5);

  const sprintsToProcess = [...activeSprints, ...futureSprints, ...closedSprints];
  const sprintResults = [];

  for (const sprint of sprintsToProcess) {
    // Closed-sprint caching: skip Jira fetch if cached and not hard refresh
    if (!hardRefresh && sprint.state === 'closed') {
      const cached = await readStorage(`sprints/${sprint.id}.json`);
      if (cached) {
        console.log(`  [${board.name}] Using cached data for closed sprint: ${sprint.name}`);
        sprintResults.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          state: sprint.state,
          issueCount: cached.issues?.length || 0,
          totalPoints: cached.summary?.totalPoints || 0,
          summary: cached.summary
        });
        continue;
      }
    }

    console.log(`  [${board.name}] Fetching sprint: ${sprint.name} (${sprint.state})`);

    const rawIssues = await fetchSprintIssues(sprint.id);

    const classifiedIssues = rawIssues.map(issue => ({
      ...issue,
      bucket: classifyIssue(issue),
      completed: issue.resolution != null
    }));

    const summary = buildSprintSummary(classifiedIssues);

    console.log(`    ${classifiedIssues.length} issues, ${summary.totalPoints} pts | tech-debt: ${summary.buckets['tech-debt-quality'].points} pts, features: ${summary.buckets['new-features'].points} pts, learning: ${summary.buckets['learning-enablement'].points} pts, uncategorized: ${summary.buckets['uncategorized'].points} pts | ${summary.unestimatedIssueCount} unestimated`);

    const sprintData = {
      sprintId: sprint.id,
      sprintName: sprint.name,
      sprintState: sprint.state,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      completeDate: sprint.completeDate,
      boardId: board.id,
      lastUpdated: new Date().toISOString(),
      issues: classifiedIssues,
      summary
    };

    await writeStorage(`sprints/${sprint.id}.json`, sprintData);

    sprintResults.push({
      sprintId: sprint.id,
      sprintName: sprint.name,
      state: sprint.state,
      issueCount: classifiedIssues.length,
      totalPoints: summary.totalPoints,
      summary
    });
  }

  // Upload sprints index for this board
  await writeStorage(`sprints/board-${board.id}.json`, {
    boardId: board.id,
    boardName: board.name,
    lastUpdated: new Date().toISOString(),
    sprints: sprintsToProcess.map(s => ({
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate,
      endDate: s.endDate,
      completeDate: s.completeDate
    }))
  });

  // Pick the active sprint (or most recent closed) for dashboard summary
  const dashboardSprint = activeSprints[0] || closedSprints[0] || null;
  const dashboardSprintResult = dashboardSprint
    ? sprintResults.find(r => r.sprintId === dashboardSprint.id)
    : null;

  return {
    board,
    sprintResults,
    dashboardSprint,
    dashboardSprintResult
  };
}

/**
 * Full refresh: fetch boards, sprints, issues, classify, and generate summaries.
 *
 * @param {object} deps
 * @param {string} deps.projectKey
 * @param {boolean} deps.hardRefresh
 * @param {function} deps.fetchBoards - (projectKey) => Promise<Board[]>
 * @param {function} deps.fetchSprints - (boardId) => Promise<Sprint[]>
 * @param {function} deps.fetchSprintIssues - (sprintId) => Promise<Issue[]>
 * @param {function} deps.readStorage - (key) => data | null
 * @param {function} deps.writeStorage - (key, data) => void
 * @returns {Promise<{ success: boolean, projectKey: string, boardCount: number, sprintCount: number }>}
 */
async function performRefresh({ projectKey, hardRefresh, fetchBoards, fetchSprints, fetchSprintIssues, readStorage, writeStorage }) {
  console.log(`Starting refresh for project ${projectKey} (hardRefresh: ${hardRefresh})`);
  const refreshStart = Date.now();

  // Step 1: Fetch all scrum boards
  console.log('Fetching boards...');
  const allBoards = await fetchBoards(projectKey);
  console.log(`Found ${allBoards.length} scrum boards`);

  // Filter to enabled boards only
  const teamsData = await readStorage('teams.json');
  let boards = allBoards;
  if (teamsData && teamsData.teams) {
    const teamMap = new Map(teamsData.teams.map(t => [t.boardId, t]));
    boards = allBoards.filter(b => {
      const team = teamMap.get(b.id);
      return !team || team.enabled !== false;
    });
    const skipped = allBoards.length - boards.length;
    if (skipped > 0) {
      console.log(`Skipping ${skipped} disabled boards`);
    }
  }

  // Step 2: Process boards in parallel
  const CONCURRENCY = 2;
  const boardResults = [];

  for (let i = 0; i < boards.length; i += CONCURRENCY) {
    const chunk = boards.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(board =>
      processBoard({ board, hardRefresh, fetchSprints, fetchSprintIssues, readStorage, writeStorage })
    ));
    boardResults.push(...chunkResults);
  }

  // Step 3: Upload boards index
  await writeStorage('boards.json', {
    lastUpdated: new Date().toISOString(),
    boards: allBoards
  });

  // Step 4: Upload teams config if it doesn't exist
  const existingTeams = await readStorage('teams.json');
  if (!existingTeams) {
    await writeStorage('teams.json', {
      teams: allBoards.map(b => ({
        boardId: b.id,
        boardName: b.name,
        displayName: b.name.replace(/^RHOAIENG\s*[-–]\s*/, ''),
        enabled: true
      }))
    });
  }

  // Step 5: Generate dashboard-summary.json
  const dashboardSummary = {
    lastUpdated: new Date().toISOString(),
    boards: {}
  };

  for (const { board, dashboardSprint, dashboardSprintResult } of boardResults) {
    if (dashboardSprint && dashboardSprintResult) {
      dashboardSummary.boards[board.id] = {
        sprint: {
          id: dashboardSprint.id,
          name: dashboardSprint.name,
          state: dashboardSprint.state,
          startDate: dashboardSprint.startDate,
          endDate: dashboardSprint.endDate
        },
        summary: dashboardSprintResult.summary
      };
    }
  }

  await writeStorage('dashboard-summary.json', dashboardSummary);

  const allSprintResults = boardResults.flatMap(r => r.sprintResults);
  const refreshElapsed = ((Date.now() - refreshStart) / 1000).toFixed(1);
  console.log(`Refresh complete: ${boards.length} boards, ${allSprintResults.length} sprints (${refreshElapsed}s)`);

  return {
    success: true,
    projectKey,
    boardCount: boards.length,
    sprintCount: allSprintResults.length,
    dashboardSummary
  };
}

/**
 * Multi-project refresh: iterate over projects, refresh each with prefixed storage,
 * then generate rollup summaries.
 *
 * @param {object} deps
 * @param {Array} deps.projects - [{ key, name }]
 * @param {boolean} deps.hardRefresh
 * @param {function} deps.fetchBoards
 * @param {function} deps.fetchSprints
 * @param {function} deps.fetchSprintIssues
 * @param {function} deps.readStorage - raw (unprefixed) storage read
 * @param {function} deps.writeStorage - raw (unprefixed) storage write
 * @returns {Promise<{ success: boolean, projects: Array }>}
 */
async function performMultiProjectRefresh({ projects, hardRefresh, fetchBoards, fetchSprints, fetchSprintIssues, readStorage, writeStorage }) {
  console.log(`Starting multi-project refresh for ${projects.length} projects`);
  const refreshStart = Date.now();

  const projectResults = [];

  for (const project of projects) {
    const prefix = getStoragePrefix(project.key);
    const { read: prefixedRead, write: prefixedWrite } = createPrefixedStorage(prefix, readStorage, writeStorage);

    try {
      const result = await performRefresh({
        projectKey: project.key,
        hardRefresh,
        fetchBoards,
        fetchSprints,
        fetchSprintIssues,
        readStorage: prefixedRead,
        writeStorage: prefixedWrite
      });
      projectResults.push({ ...result, success: true });
    } catch (error) {
      console.error(`Failed to refresh project ${project.key}:`, error.message);
      projectResults.push({
        success: false,
        projectKey: project.key,
        error: error.message
      });
    }
  }

  // Build rollup summaries from each project's in-memory dashboard summary
  const projectSummaries = [];
  for (const result of projectResults) {
    if (!result.success || !result.dashboardSummary?.boards) continue;
    const boardSummaries = Object.values(result.dashboardSummary.boards)
      .filter(b => b.summary)
      .map(b => b.summary);
    const projSummary = buildProjectSummary(boardSummaries);
    projectSummaries.push(projSummary);
  }

  const orgSummary = buildOrgSummary(projectSummaries);
  await writeStorage('data/org-summary.json', {
    lastUpdated: new Date().toISOString(),
    ...orgSummary
  });

  const refreshElapsed = ((Date.now() - refreshStart) / 1000).toFixed(1);
  console.log(`Multi-project refresh complete: ${projects.length} projects (${refreshElapsed}s)`);

  return {
    success: true,
    projects: projectResults
  };
}

module.exports = { discoverBoards, performRefresh, processBoard, performMultiProjectRefresh };
