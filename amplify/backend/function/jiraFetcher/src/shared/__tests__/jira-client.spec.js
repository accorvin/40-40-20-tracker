// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createJiraClient } from '../jira-client.js';

describe('createJiraClient', () => {
  const jiraHost = 'https://jira.example.com';

  describe('fetchBoards', () => {
    it('fetches all boards with pagination', async () => {
      const jiraRequest = vi.fn()
        .mockResolvedValueOnce({
          values: [
            { id: 1, name: 'Board A' },
            { id: 2, name: 'Board B' }
          ],
          isLast: false
        })
        .mockResolvedValueOnce({
          values: [{ id: 3, name: 'Board C' }],
          isLast: true
        });

      const client = createJiraClient({ jiraRequest, jiraHost });
      const boards = await client.fetchBoards('PROJ');

      expect(boards).toEqual([
        { id: 1, name: 'Board A', projectKey: 'PROJ' },
        { id: 2, name: 'Board B', projectKey: 'PROJ' },
        { id: 3, name: 'Board C', projectKey: 'PROJ' }
      ]);
      expect(jiraRequest).toHaveBeenCalledTimes(2);
      expect(jiraRequest.mock.calls[0][0]).toContain('projectKeyOrId=PROJ');
      expect(jiraRequest.mock.calls[0][0]).toContain('startAt=0');
      expect(jiraRequest.mock.calls[1][0]).toContain('startAt=50');
    });

    it('handles single page of results', async () => {
      const jiraRequest = vi.fn().mockResolvedValueOnce({
        values: [{ id: 1, name: 'Board A' }],
        isLast: true
      });

      const client = createJiraClient({ jiraRequest, jiraHost });
      const boards = await client.fetchBoards('PROJ');

      expect(boards).toEqual([{ id: 1, name: 'Board A', projectKey: 'PROJ' }]);
      expect(jiraRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchSprints', () => {
    it('fetches all sprints for a board with pagination', async () => {
      const jiraRequest = vi.fn().mockResolvedValueOnce({
        values: [
          { id: 100, name: 'Sprint 1', state: 'closed', startDate: '2025-01-01', endDate: '2025-01-14', completeDate: '2025-01-15' },
          { id: 101, name: 'Sprint 2', state: 'active', startDate: '2025-01-15', endDate: '2025-01-28', completeDate: null }
        ],
        isLast: true
      });

      const client = createJiraClient({ jiraRequest, jiraHost });
      const sprints = await client.fetchSprints(42);

      expect(sprints).toEqual([
        { id: 100, name: 'Sprint 1', state: 'closed', startDate: '2025-01-01', endDate: '2025-01-14', completeDate: '2025-01-15', boardId: 42 },
        { id: 101, name: 'Sprint 2', state: 'active', startDate: '2025-01-15', endDate: '2025-01-28', completeDate: null, boardId: 42 }
      ]);
      expect(jiraRequest.mock.calls[0][0]).toContain('/board/42/sprint');
    });

    it('normalizes missing dates to null', async () => {
      const jiraRequest = vi.fn().mockResolvedValueOnce({
        values: [{ id: 100, name: 'Sprint 1', state: 'future' }],
        isLast: true
      });

      const client = createJiraClient({ jiraRequest, jiraHost });
      const sprints = await client.fetchSprints(42);

      expect(sprints[0].startDate).toBeNull();
      expect(sprints[0].endDate).toBeNull();
      expect(sprints[0].completeDate).toBeNull();
    });
  });

  describe('fetchSprintIssues', () => {
    it('fetches and transforms issue fields correctly', async () => {
      const jiraRequest = vi.fn().mockResolvedValueOnce({
        total: 2,
        issues: [
          {
            key: 'PROJ-1',
            fields: {
              summary: 'Fix bug',
              issuetype: { name: 'Bug' },
              status: { name: 'Done' },
              assignee: { displayName: 'Alice' },
              customfield_12310243: 3,
              customfield_12320040: { value: 'Tech Debt & Quality' },
              resolution: { name: 'Done' },
              resolutiondate: '2025-01-10'
            }
          },
          {
            key: 'PROJ-2',
            fields: {
              summary: 'Add feature',
              issuetype: { name: 'Story' },
              status: { name: 'In Progress' },
              assignee: null,
              customfield_12310243: null,
              customfield_12320040: null,
              resolution: null,
              resolutiondate: null
            }
          }
        ]
      });

      const client = createJiraClient({ jiraRequest, jiraHost });
      const issues = await client.fetchSprintIssues(200);

      expect(issues).toHaveLength(2);
      expect(issues[0]).toEqual({
        key: 'PROJ-1',
        summary: 'Fix bug',
        issueType: 'Bug',
        status: 'Done',
        assignee: 'Alice',
        storyPoints: 3,
        activityType: 'Tech Debt & Quality',
        resolution: 'Done',
        resolutionDate: '2025-01-10',
        url: 'https://jira.example.com/browse/PROJ-1'
      });
      expect(issues[1].assignee).toBeNull();
      expect(issues[1].storyPoints).toBeNull();
      expect(issues[1].activityType).toBeNull();
    });

    it('paginates when total exceeds maxResults', async () => {
      const jiraRequest = vi.fn()
        .mockResolvedValueOnce({
          total: 101,
          issues: [{ key: 'PROJ-1', fields: { summary: 'A', issuetype: { name: 'Bug' }, status: { name: 'Done' }, assignee: null, customfield_12310243: null, customfield_12320040: null, resolution: null, resolutiondate: null } }]
        })
        .mockResolvedValueOnce({
          total: 101,
          issues: [{ key: 'PROJ-2', fields: { summary: 'B', issuetype: { name: 'Story' }, status: { name: 'Done' }, assignee: null, customfield_12310243: null, customfield_12320040: null, resolution: null, resolutiondate: null } }]
        });

      const client = createJiraClient({ jiraRequest, jiraHost });
      const issues = await client.fetchSprintIssues(200);

      expect(issues).toHaveLength(2);
      expect(jiraRequest).toHaveBeenCalledTimes(2);
      expect(jiraRequest.mock.calls[0][0]).toContain('startAt=0');
      expect(jiraRequest.mock.calls[1][0]).toContain('startAt=100');
    });

    it('requests the correct custom fields', async () => {
      const jiraRequest = vi.fn().mockResolvedValueOnce({
        total: 0,
        issues: []
      });

      const client = createJiraClient({ jiraRequest, jiraHost });
      await client.fetchSprintIssues(200);

      expect(jiraRequest.mock.calls[0][0]).toContain('customfield_12310243');
      expect(jiraRequest.mock.calls[0][0]).toContain('customfield_12320040');
    });
  });
});
