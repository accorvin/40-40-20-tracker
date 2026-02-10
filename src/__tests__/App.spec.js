/**
 * Tests for App.vue component - following TDD practices.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import App from '../App.vue'
import BoardSettings from '../components/BoardSettings.vue'
import DashboardGrid from '../components/DashboardGrid.vue'

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

  const mockSprintsResponse = {
    sprints: [
      { id: 100, name: 'Sprint 42', state: 'active', startDate: '2026-02-03T00:00:00.000Z', endDate: '2026-02-14T00:00:00.000Z' },
      { id: 99, name: 'Sprint 41', state: 'closed', startDate: '2026-01-20T00:00:00.000Z', endDate: '2026-02-02T00:00:00.000Z' }
    ]
  }

  const mockSprintIssuesResponse = {
    sprintId: 100,
    sprintName: 'Sprint 42',
    issues: [],
    summary: {
      totalPoints: 45,
      estimatedIssueCount: 10,
      unestimatedIssueCount: 3,
      buckets: {
        'bugs-tech-debt': { points: 20, issueCount: 4, completedPoints: 10 },
        'feature-work': { points: 25, issueCount: 6, completedPoints: 10 },
        'learning': { points: 0, issueCount: 0, completedPoints: 0 }
      }
    }
  }

  beforeEach(() => {
    fetch.mockReset()
    localStorageMock.getItem.mockReset()
    localStorageMock.setItem.mockReset()
    localStorageMock.removeItem.mockReset()

    fetch.mockImplementation((url) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockBoardsResponse
        })
      }
      if (url.match(/\/boards\/\d+\/sprints$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintsResponse
        })
      }
      if (url.match(/\/sprints\/\d+\/issues$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintIssuesResponse
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })
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

  it('fetches boards on mount', async () => {
    mount(App)
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/boards'),
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
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Team Alpha')
    expect(wrapper.text()).toContain('Back to Dashboard')
  })

  it('navigates back to dashboard from team detail', async () => {
    const wrapper = mount(App)
    await flushPromises()

    // Navigate to team detail
    const grid = wrapper.findComponent(DashboardGrid)
    grid.vm.$emit('select-team', mockBoardsResponse.boards[0])
    await wrapper.vm.$nextTick()

    // Click back button
    const backButton = wrapper.findAll('button').find(b => b.text().includes('Back to Dashboard'))
    await backButton.trigger('click')
    await wrapper.vm.$nextTick()

    // Should show dashboard again
    const gridAgain = wrapper.findComponent(DashboardGrid)
    expect(gridAgain.exists()).toBe(true)
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
      if (url.match(/\/boards\/\d+\/sprints$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintsResponse
        })
      }
      if (url.match(/\/sprints\/\d+\/issues$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintIssuesResponse
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
    fetch.mockImplementation(() => {
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

    // Add mock for /teams GET since BoardSettings will call it
    fetch.mockImplementation((url, options) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockBoardsResponse
        })
      }
      if (url.endsWith('/teams') && (!options || options.method === 'GET' || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ teams: [] })
        })
      }
      if (url.match(/\/boards\/\d+\/sprints$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintsResponse
        })
      }
      if (url.match(/\/sprints\/\d+\/issues$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintIssuesResponse
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })

    const settingsButton = wrapper.findAll('button').find(b => b.attributes('title') === 'Board Settings')
    await settingsButton.trigger('click')
    await flushPromises()

    const boardSettings = wrapper.findComponent(BoardSettings)
    expect(boardSettings.exists()).toBe(true)
  })

  it('navigates back to dashboard from board settings', async () => {
    const wrapper = mount(App)
    await flushPromises()

    fetch.mockImplementation((url, options) => {
      if (url.endsWith('/boards')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockBoardsResponse
        })
      }
      if (url.endsWith('/teams') && (!options || options.method === 'GET' || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ teams: [] })
        })
      }
      if (url.match(/\/boards\/\d+\/sprints$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintsResponse
        })
      }
      if (url.match(/\/sprints\/\d+\/issues$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSprintIssuesResponse
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })

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

  it('fetches sprint data per board after loading boards', async () => {
    mount(App)
    await flushPromises()

    // Should have called sprints endpoint for each board
    const sprintCalls = fetch.mock.calls.filter(([url]) => url.match(/\/boards\/\d+\/sprints$/))
    expect(sprintCalls).toHaveLength(2)

    // Should have called sprint issues for the active sprint of each board
    const issueCalls = fetch.mock.calls.filter(([url]) => url.match(/\/sprints\/\d+\/issues$/))
    expect(issueCalls).toHaveLength(2)
  })

  it('passes boardSprintData to DashboardGrid', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const grid = wrapper.findComponent(DashboardGrid)
    const sprintData = grid.props('boardSprintData')
    expect(sprintData).toBeDefined()
    expect(sprintData[1]).toBeDefined()
    expect(sprintData[1].sprint.id).toBe(100) // Active sprint selected
    expect(sprintData[1].summary).toBeDefined()
    expect(sprintData[1].summary.totalPoints).toBe(45)
    expect(sprintData[1].summary.buckets).toBeDefined()
    expect(sprintData[2]).toBeDefined()
  })
})
