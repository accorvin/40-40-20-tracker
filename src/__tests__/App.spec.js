/**
 * Tests for App.vue component - following TDD practices.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import App from '../App.vue'
import BoardSettings from '../components/BoardSettings.vue'
import DashboardGrid from '../components/DashboardGrid.vue'
import FilterEditor from '../components/FilterEditor.vue'
import FilterSelector from '../components/FilterSelector.vue'
import TeamDetail from '../components/TeamDetail.vue'

// Mock useAuth composable
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    user: ref({
      email: 'test@redhat.com',
      displayName: 'Test User',
      photoURL: null,
      getIdToken: async () => 'mock-token'
    }),
    loading: ref(false),
    error: ref(null),
    signIn: vi.fn(),
    signOut: vi.fn(),
    getIdToken: vi.fn(async () => 'mock-token')
  })
}))

// Mock fetch
global.fetch = vi.fn()

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
}
global.localStorage = localStorageMock

describe('App', () => {
  const mockBoardsResponse = {
    boards: [
      { id: 1, name: 'Board Alpha', displayName: 'Team Alpha' },
      { id: 2, name: 'Board Beta', displayName: 'Team Beta' }
    ],
    lastUpdated: '2026-02-09T12:00:00Z'
  }

  const mockDashboardSummaryResponse = {
    lastUpdated: '2026-02-09T12:00:00Z',
    boards: {
      1: {
        sprint: { id: 100, name: 'Sprint 42', state: 'active', startDate: '2026-02-03T00:00:00.000Z', endDate: '2026-02-14T00:00:00.000Z' },
        summary: {
          totalPoints: 45,
          estimatedIssueCount: 10,
          unestimatedIssueCount: 3,
          buckets: {
            'tech-debt-quality': { points: 20, issueCount: 4, completedPoints: 10 },
            'new-features': { points: 25, issueCount: 6, completedPoints: 10 },
            'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
            'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
          }
        }
      },
      2: {
        sprint: { id: 200, name: 'Sprint 10', state: 'active', startDate: '2026-02-03T00:00:00.000Z', endDate: '2026-02-14T00:00:00.000Z' },
        summary: {
          totalPoints: 30,
          estimatedIssueCount: 8,
          unestimatedIssueCount: 1,
          buckets: {
            'tech-debt-quality': { points: 15, issueCount: 3, completedPoints: 5 },
            'new-features': { points: 15, issueCount: 5, completedPoints: 5 },
            'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
            'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
          }
        }
      }
    }
  }

  const mockSprintsResponse = {
    sprints: [
      { id: 100, name: 'Sprint 42', state: 'active', startDate: '2026-02-03', endDate: '2026-02-14' },
      { id: 101, name: 'Sprint 43', state: 'future', startDate: '2026-02-17', endDate: '2026-02-28' },
      { id: 99, name: 'Sprint 41', state: 'closed', startDate: '2026-01-20', endDate: '2026-01-31' }
    ]
  }

  // Matches the actual API response format: flat issues array, no percentage, no top-level completedPoints
  const mockSprintIssuesResponse = {
    sprintId: 100,
    sprintName: 'Sprint 42',
    sprintState: 'active',
    startDate: '2026-02-03',
    endDate: '2026-02-14',
    boardId: 1,
    lastUpdated: '2026-02-09T12:00:00Z',
    summary: {
      totalPoints: 45,
      estimatedIssueCount: 10,
      unestimatedIssueCount: 1,
      buckets: {
        'tech-debt-quality': { points: 20, issueCount: 4, completedPoints: 10 },
        'new-features': { points: 25, issueCount: 6, completedPoints: 10 },
        'learning-enablement': { points: 0, issueCount: 0, completedPoints: 0 },
        'uncategorized': { points: 0, issueCount: 0, completedPoints: 0 }
      }
    },
    issues: [
      { key: 'RHOAIENG-1', summary: 'Fix bug', url: 'https://issues.redhat.com/browse/RHOAIENG-1', storyPoints: 5, status: 'Done', completed: true, bucket: 'tech-debt-quality' },
      { key: 'RHOAIENG-2', summary: 'Feature', url: 'https://issues.redhat.com/browse/RHOAIENG-2', storyPoints: 8, status: 'In Progress', completed: false, bucket: 'new-features' }
    ]
  }

  function setupFetchMock(overrides = {}) {
    fetch.mockImplementation((url, options) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockBoardsResponse
        })
      }
      if (url.endsWith('/dashboard-summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockDashboardSummaryResponse
        })
      }
      if (url.endsWith('/refresh')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'started' })
        })
      }
      if (url.match(/\/boards\/\d+\/sprints$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => overrides.sprints || mockSprintsResponse
        })
      }
      if (url.match(/\/sprints\/\d+\/issues$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => overrides.sprintIssues || mockSprintIssuesResponse
        })
      }
      if (url.endsWith('/teams') && (!options || options.method === 'GET' || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ teams: [] })
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })
  }

  beforeEach(() => {
    fetch.mockReset()
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    localStorageMock.removeItem.mockReset()

    setupFetchMock()
  })

  it('renders app title', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('40-40-20 Sprint Allocation Tracker')
  })

  it('renders Red Hat logo', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const logo = wrapper.find('img[alt="Red Hat"]')
    expect(logo.exists()).toBe(true)
    expect(logo.attributes('src')).toContain('redhat-logo.svg')
  })

  it('renders Refresh button', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const refreshButton = wrapper.findAll('button').find(b => b.text().includes('Refresh'))
    expect(refreshButton.exists()).toBe(true)
  })

  it('renders DashboardGrid component', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    expect(grid.exists()).toBe(true)
  })

  it('fetches boards and dashboard summary on mount', async () => {
    mount(App)
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/boards'),
      expect.any(Object)
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/dashboard-summary'),
      expect.any(Object)
    )
  })

  it('passes boards to DashboardGrid', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    expect(grid.props('boards')).toHaveLength(2)
    expect(grid.props('boards')[0].displayName).toBe('Team Alpha')
  })

  it('does not show stale icon when data is recent', async () => {
    const recentDate = new Date().toISOString()
    fetch.mockReset()
    fetch.mockImplementation((url) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockBoardsResponse, lastUpdated: recentDate })
        })
      }
      if (url.endsWith('/dashboard-summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockDashboardSummaryResponse, lastUpdated: recentDate })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('[data-testid="stale-icon"]').exists()).toBe(false)
  })

  it('shows stale icon when data is older than 1 hour', async () => {
    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    setupFetchMock()
    fetch.mockImplementation((url, options) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockBoardsResponse, lastUpdated: staleDate })
        })
      }
      if (url.endsWith('/dashboard-summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockDashboardSummaryResponse, lastUpdated: staleDate })
        })
      }
      // Fall through to default mock for other URLs
      return setupFetchMock(), fetch(url, options)
    })

    // Re-mock cleanly
    fetch.mockReset()
    fetch.mockImplementation((url) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockBoardsResponse, lastUpdated: staleDate })
        })
      }
      if (url.endsWith('/dashboard-summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockDashboardSummaryResponse, lastUpdated: staleDate })
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('[data-testid="stale-icon"]').exists()).toBe(true)
  })

  it('renders last updated timestamp when data is loaded', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('Last Updated')
  })

  it('shows user initials when no photo', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).toContain('TU')
  })

  it('navigates to team detail when team is selected', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await flushPromises()

    const teamDetail = wrapper.findComponent(TeamDetail)
    expect(teamDetail.exists()).toBe(true)
    expect(wrapper.text()).toContain('Team Alpha')
    expect(wrapper.text()).toContain('Back to Dashboard')
  })

  it('navigates back to dashboard from team detail', async () => {
    const wrapper = mount(App)
    await flushPromises()

    // Navigate to team detail
    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await flushPromises()

    // Emit back from TeamDetail
    const teamDetail = wrapper.findComponent(TeamDetail)
    teamDetail.vm.$emit('back')
    await wrapper.vm.$nextTick()

    // Should show dashboard again
    const gridAgain = wrapper.findComponent(DashboardGrid)
    expect(gridAgain.exists()).toBe(true)
  })

  it('fetches sprints and issues when navigating to team detail', async () => {
    const wrapper = mount(App)
    await flushPromises()

    fetch.mockClear()
    setupFetchMock()

    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await flushPromises()

    // Should have fetched sprints for board 1
    const sprintCalls = fetch.mock.calls.filter(([url]) => url.match(/\/boards\/1\/sprints$/))
    expect(sprintCalls).toHaveLength(1)

    // Should have fetched issues for the active sprint (id: 100)
    const issueCalls = fetch.mock.calls.filter(([url]) => url.match(/\/sprints\/100\/issues$/))
    expect(issueCalls).toHaveLength(1)
  })

  it('passes sprint data to TeamDetail component', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await flushPromises()

    const teamDetail = wrapper.findComponent(TeamDetail)
    expect(teamDetail.props('sprints')).toHaveLength(3)
    expect(teamDetail.props('selectedSprint').id).toBe(100)
    expect(teamDetail.props('sprintData')).toBeDefined()
    expect(teamDetail.props('sprintData').summary.totalPoints).toBe(45)
  })

  it('loads new sprint data when sprint is changed', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await flushPromises()

    fetch.mockClear()
    setupFetchMock()

    // Change sprint
    const teamDetail = wrapper.findComponent(TeamDetail)
    teamDetail.vm.$emit('select-sprint', 99)
    await flushPromises()

    // Should have fetched issues for sprint 99
    const issueCalls = fetch.mock.calls.filter(([url]) => url.match(/\/sprints\/99\/issues$/))
    expect(issueCalls).toHaveLength(1)
  })

  it('saves selected sprint to localStorage when sprint is changed', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await flushPromises()

    const teamDetail = wrapper.findComponent(TeamDetail)
    teamDetail.vm.$emit('select-sprint', 99)
    await flushPromises()

    const savedCall = localStorageMock.setItem.mock.calls.find(
      ([key]) => key === 'selectedSprints'
    )
    expect(savedCall).toBeTruthy()
    const saved = JSON.parse(savedCall[1])
    expect(saved[1]).toBe(99)
  })

  it('restores saved sprint when navigating to team detail', async () => {
    // Pre-set saved sprint for board 1
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'selectedSprints') return JSON.stringify({ 1: 99 })
      return null
    })

    const wrapper = mount(App)
    await flushPromises()

    fetch.mockClear()
    setupFetchMock()

    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await flushPromises()

    // Should have fetched issues for sprint 99 (restored), not 100 (active)
    const issueCalls = fetch.mock.calls.filter(([url]) => url.match(/\/sprints\/99\/issues$/))
    expect(issueCalls).toHaveLength(1)

    const sprint100Calls = fetch.mock.calls.filter(([url]) => url.match(/\/sprints\/100\/issues$/))
    expect(sprint100Calls).toHaveLength(0)
  })

  it('shows loading overlay during data fetch', async () => {
    let resolveBoards
    const boardsPromise = new Promise((resolve) => {
      resolveBoards = resolve
    })

    fetch.mockImplementation((url) => {
      if (url.endsWith('/boards')) {
        return boardsPromise.then(() => Promise.resolve({
          ok: true,
          json: async () => mockBoardsResponse
        }))
      }
      if (url.endsWith('/dashboard-summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockDashboardSummaryResponse
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })

    const wrapper = mount(App)
    await flushPromises()

    // Loading indicator should be visible
    expect(wrapper.find('[data-testid="loading-overlay"]').exists()).toBe(true)

    resolveBoards()
    await flushPromises()

    expect(wrapper.find('[data-testid="loading-overlay"]').exists()).toBe(false)
  })

  it('handles boards fetch error gracefully', async () => {
    fetch.mockImplementation((url) => {
      if (url.endsWith('/dashboard-summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockDashboardSummaryResponse
        })
      }
      return Promise.reject(new Error('Network error'))
    })

    const wrapper = mount(App)
    await flushPromises()

    // Should not crash, should show empty dashboard
    const grid = wrapper.findComponent(DashboardGrid)
    expect(grid.exists()).toBe(true)
    expect(grid.props('boards')).toHaveLength(0)
  })

  it('renders a settings gear icon button', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const settingsButton = wrapper.findAll('button').find(b => b.attributes('title') === 'Board Settings')
    expect(settingsButton.exists()).toBe(true)
  })

  it('navigates to board settings when gear icon is clicked', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const settingsButton = wrapper.findAll('button').find(b => b.attributes('title') === 'Board Settings')
    await settingsButton.trigger('click')
    await flushPromises()

    const boardSettings = wrapper.findComponent(BoardSettings)
    expect(boardSettings.exists()).toBe(true)
  })

  it('navigates back to dashboard from board settings', async () => {
    const wrapper = mount(App)
    await flushPromises()

    // Navigate to settings
    const settingsButton = wrapper.findAll('button').find(b => b.attributes('title') === 'Board Settings')
    await settingsButton.trigger('click')
    await flushPromises()

    // Click back
    const boardSettings = wrapper.findComponent(BoardSettings)
    boardSettings.vm.$emit('back')
    await wrapper.vm.$nextTick()

    // Should show dashboard again
    const grid = wrapper.findComponent(DashboardGrid)
    expect(grid.exists()).toBe(true)
  })

  it('passes boardSprintData from dashboard summary to DashboardGrid', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    const sprintData = grid.props('boardSprintData')
    expect(sprintData).toBeDefined()
    expect(sprintData[1]).toBeDefined()
    expect(sprintData[1].sprint.id).toBe(100)
    expect(sprintData[1].summary).toBeDefined()
    expect(sprintData[1].summary.totalPoints).toBe(45)
    expect(sprintData[1].summary.buckets).toBeDefined()
    expect(sprintData[2]).toBeDefined()
  })

  it('sends async refresh and shows toast', async () => {
    const wrapper = mount(App)
    await flushPromises()

    // Click the main Refresh button
    const refreshButton = wrapper.findAll('button').find(b => b.text() === 'Refresh' && !b.attributes('title'))
    await refreshButton.trigger('click')
    await flushPromises()

    // Should have called /refresh
    const refreshCalls = fetch.mock.calls.filter(([url]) => url.endsWith('/refresh'))
    expect(refreshCalls).toHaveLength(1)

    // Body should include hardRefresh: false
    const body = JSON.parse(refreshCalls[0][1].body)
    expect(body.hardRefresh).toBe(false)

    // Should show a toast
    expect(wrapper.text()).toContain('Refresh started')
  })

  it('shows refresh dropdown with Full Refresh option', async () => {
    const wrapper = mount(App)
    await flushPromises()

    // Click the chevron dropdown button
    const chevronButton = wrapper.findAll('button').find(b => {
      return b.find('svg path[d="M19 9l-7 7-7-7"]').exists()
    })
    expect(chevronButton.exists()).toBe(true)

    await chevronButton.trigger('click')
    await wrapper.vm.$nextTick()

    // Should show dropdown with Full Refresh option
    expect(wrapper.text()).toContain('Full Refresh')
  })

  it('sends hardRefresh when Full Refresh is clicked', async () => {
    const wrapper = mount(App)
    await flushPromises()

    // Open dropdown
    const chevronButton = wrapper.findAll('button').find(b => {
      return b.find('svg path[d="M19 9l-7 7-7-7"]').exists()
    })
    await chevronButton.trigger('click')
    await wrapper.vm.$nextTick()

    // Click Full Refresh
    const fullRefreshButton = wrapper.findAll('button').find(b => b.text() === 'Full Refresh')
    await fullRefreshButton.trigger('click')
    await flushPromises()

    // Should have called /refresh with hardRefresh: true
    const refreshCalls = fetch.mock.calls.filter(([url]) => url.endsWith('/refresh'))
    expect(refreshCalls).toHaveLength(1)
    const body = JSON.parse(refreshCalls[0][1].body)
    expect(body.hardRefresh).toBe(true)
  })

  it('loads only 2 API calls on mount (boards + dashboard-summary)', async () => {
    fetch.mockReset()
    fetch.mockImplementation((url) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockBoardsResponse
        })
      }
      if (url.endsWith('/dashboard-summary')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockDashboardSummaryResponse
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })

    mount(App)
    await flushPromises()

    // Should only have 2 fetch calls: /boards and /dashboard-summary
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  describe('Saved Filters', () => {
    it('renders FilterSelector in dashboard view', async () => {
      const wrapper = mount(App)
      await flushPromises()

      const filterSelector = wrapper.findComponent(FilterSelector)
      expect(filterSelector.exists()).toBe(true)
    })

    it('does not render FilterSelector in team detail view', async () => {
      const wrapper = mount(App)
      await flushPromises()

      const grid = wrapper.findComponent(DashboardGrid)
      grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
      await flushPromises()

      const filterSelector = wrapper.findComponent(FilterSelector)
      expect(filterSelector.exists()).toBe(false)
    })

    it('passes all boards to DashboardGrid when no filter is active', async () => {
      const wrapper = mount(App)
      await flushPromises()

      const grid = wrapper.findComponent(DashboardGrid)
      expect(grid.props('boards')).toHaveLength(2)
    })

    it('passes filtered boards to DashboardGrid when a filter is active', async () => {
      // Pre-set a filter in localStorage that includes only board 1
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'dashboardFilters') {
          return JSON.stringify([{ id: 'f1', name: 'Just Alpha', boardIds: [1] }])
        }
        if (key === 'activeFilterId') return 'f1'
        return null
      })

      const wrapper = mount(App)
      await flushPromises()

      const grid = wrapper.findComponent(DashboardGrid)
      expect(grid.props('boards')).toHaveLength(1)
      expect(grid.props('boards')[0].id).toBe(1)
    })

    it('shows all boards when "All Teams" is selected', async () => {
      // Start with a filter active
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'dashboardFilters') {
          return JSON.stringify([{ id: 'f1', name: 'Just Alpha', boardIds: [1] }])
        }
        if (key === 'activeFilterId') return 'f1'
        return null
      })

      const wrapper = mount(App)
      await flushPromises()

      // Select "All Teams" via FilterSelector
      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('select-filter', null)
      await wrapper.vm.$nextTick()

      const grid = wrapper.findComponent(DashboardGrid)
      expect(grid.props('boards')).toHaveLength(2)
    })

    it('opens FilterEditor when create-filter is emitted', async () => {
      const wrapper = mount(App)
      await flushPromises()

      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('create-filter')
      await wrapper.vm.$nextTick()

      const editor = wrapper.findComponent(FilterEditor)
      expect(editor.exists()).toBe(true)
      expect(editor.props('filter')).toBeNull()
    })

    it('opens FilterEditor with filter data when edit-filter is emitted', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'dashboardFilters') {
          return JSON.stringify([{ id: 'f1', name: 'My Teams', boardIds: [1] }])
        }
        return null
      })

      const wrapper = mount(App)
      await flushPromises()

      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('edit-filter', 'f1')
      await wrapper.vm.$nextTick()

      const editor = wrapper.findComponent(FilterEditor)
      expect(editor.exists()).toBe(true)
      expect(editor.props('filter').id).toBe('f1')
      expect(editor.props('filter').name).toBe('My Teams')
    })

    it('passes all boards to FilterEditor', async () => {
      const wrapper = mount(App)
      await flushPromises()

      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('create-filter')
      await wrapper.vm.$nextTick()

      const editor = wrapper.findComponent(FilterEditor)
      expect(editor.props('boards')).toHaveLength(2)
    })

    it('creates a new filter when FilterEditor emits save in create mode', async () => {
      const wrapper = mount(App)
      await flushPromises()

      // Open create modal
      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('create-filter')
      await wrapper.vm.$nextTick()

      // Save the filter
      const editor = wrapper.findComponent(FilterEditor)
      editor.vm.$emit('save', { name: 'New Filter', boardIds: [1] })
      await wrapper.vm.$nextTick()

      // Editor should close
      expect(wrapper.findComponent(FilterEditor).exists()).toBe(false)

      // Filter should be persisted
      const savedCall = localStorageMock.setItem.mock.calls.find(
        ([key]) => key === 'dashboardFilters'
      )
      expect(savedCall).toBeTruthy()
      const saved = JSON.parse(savedCall[1])
      expect(saved.some(f => f.name === 'New Filter')).toBe(true)
    })

    it('updates a filter when FilterEditor emits save in edit mode', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'dashboardFilters') {
          return JSON.stringify([{ id: 'f1', name: 'Old Name', boardIds: [1] }])
        }
        return null
      })

      const wrapper = mount(App)
      await flushPromises()

      // Open edit modal
      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('edit-filter', 'f1')
      await wrapper.vm.$nextTick()

      // Save updated filter
      const editor = wrapper.findComponent(FilterEditor)
      editor.vm.$emit('save', { name: 'Updated Name', boardIds: [1, 2] })
      await wrapper.vm.$nextTick()

      // Editor should close
      expect(wrapper.findComponent(FilterEditor).exists()).toBe(false)

      // Filter should be updated in localStorage
      const savedCalls = localStorageMock.setItem.mock.calls.filter(
        ([key]) => key === 'dashboardFilters'
      )
      const lastSave = JSON.parse(savedCalls[savedCalls.length - 1][1])
      expect(lastSave[0].name).toBe('Updated Name')
      expect(lastSave[0].boardIds).toEqual([1, 2])
    })

    it('deletes a filter when delete-filter is emitted', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'dashboardFilters') {
          return JSON.stringify([
            { id: 'f1', name: 'Filter One', boardIds: [1] },
            { id: 'f2', name: 'Filter Two', boardIds: [2] }
          ])
        }
        return null
      })

      const wrapper = mount(App)
      await flushPromises()

      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('delete-filter', 'f1')
      await wrapper.vm.$nextTick()

      // Check that filter was removed from localStorage
      const savedCalls = localStorageMock.setItem.mock.calls.filter(
        ([key]) => key === 'dashboardFilters'
      )
      const lastSave = JSON.parse(savedCalls[savedCalls.length - 1][1])
      expect(lastSave).toHaveLength(1)
      expect(lastSave[0].id).toBe('f2')
    })

    it('closes FilterEditor when cancel is emitted', async () => {
      const wrapper = mount(App)
      await flushPromises()

      // Open create modal
      const filterSelector = wrapper.findComponent(FilterSelector)
      filterSelector.vm.$emit('create-filter')
      await wrapper.vm.$nextTick()

      expect(wrapper.findComponent(FilterEditor).exists()).toBe(true)

      // Cancel
      const editor = wrapper.findComponent(FilterEditor)
      editor.vm.$emit('cancel')
      await wrapper.vm.$nextTick()

      expect(wrapper.findComponent(FilterEditor).exists()).toBe(false)
    })

    it('excludes boards not in active filter even if they exist in API response', async () => {
      // Filter only includes board 2
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'dashboardFilters') {
          return JSON.stringify([{ id: 'f1', name: 'Beta Only', boardIds: [2] }])
        }
        if (key === 'activeFilterId') return 'f1'
        return null
      })

      const wrapper = mount(App)
      await flushPromises()

      const grid = wrapper.findComponent(DashboardGrid)
      expect(grid.props('boards')).toHaveLength(1)
      expect(grid.props('boards')[0].displayName).toBe('Team Beta')
    })
  })
})
