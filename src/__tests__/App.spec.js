/**
 * Tests for App.vue component - following TDD practices.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import App from '../App.vue'
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
})
