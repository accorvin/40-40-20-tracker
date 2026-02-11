/**
 * Tests for BoardSettings.vue component - following TDD practices.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import BoardSettings from '../components/BoardSettings.vue'

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

describe('BoardSettings', () => {
  const mockTeams = [
    { boardId: 1, boardName: 'RHOAIENG - Alpha', displayName: 'Alpha', enabled: true },
    { boardId: 2, boardName: 'RHOAIENG - Beta', displayName: 'Beta', enabled: true },
    { boardId: 3, boardName: 'RHOAIENG - Gamma', displayName: 'Gamma', enabled: false }
  ]

  beforeEach(() => {
    fetch.mockReset()

    // Default: getTeams returns mock teams
    fetch.mockImplementation((url, options) => {
      if (url.endsWith('/teams') && (!options || options.method === 'GET' || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ teams: mockTeams })
        })
      }
      if (url.endsWith('/teams') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        })
      }
      if (url.endsWith('/discover-boards') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, boardCount: 4 })
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })
  })

  it('renders the settings title', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    expect(wrapper.text()).toContain('Board Settings')
  })

  it('renders a back button', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const backButton = wrapper.findAll('button').find(b => b.text().includes('Back'))
    expect(backButton.exists()).toBe(true)
  })

  it('emits back event when back button is clicked', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const backButton = wrapper.findAll('button').find(b => b.text().includes('Back'))
    await backButton.trigger('click')

    expect(wrapper.emitted('back')).toBeTruthy()
  })

  it('loads and displays teams on mount', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/teams'),
      expect.objectContaining({ method: 'GET' })
    )

    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Beta')
    expect(wrapper.text()).toContain('Gamma')
  })

  it('renders toggle switches for each board', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const toggles = wrapper.findAll('input[type="checkbox"]')
    expect(toggles).toHaveLength(3)
  })

  it('reflects enabled state in toggles', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const toggles = wrapper.findAll('input[type="checkbox"]')
    // Alpha and Beta enabled, Gamma disabled
    expect(toggles[0].element.checked).toBe(true)
    expect(toggles[1].element.checked).toBe(true)
    expect(toggles[2].element.checked).toBe(false)
  })

  it('toggles board enabled state when checkbox is clicked', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const toggles = wrapper.findAll('input[type="checkbox"]')
    // Disable Alpha
    await toggles[0].setValue(false)

    expect(toggles[0].element.checked).toBe(false)
  })

  it('renders a Save button', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
    expect(saveButton.exists()).toBe(true)
  })

  it('calls saveTeams with updated teams on Save click', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    // Toggle Alpha off
    const toggles = wrapper.findAll('input[type="checkbox"]')
    await toggles[0].setValue(false)

    // Click save
    const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
    await saveButton.trigger('click')
    await flushPromises()

    // Find the POST /teams call
    const saveCall = fetch.mock.calls.find(
      ([url, opts]) => url.endsWith('/teams') && opts?.method === 'POST'
    )
    expect(saveCall).toBeTruthy()

    const body = JSON.parse(saveCall[1].body)
    expect(body.teams[0].enabled).toBe(false)
    expect(body.teams[1].enabled).toBe(true)
    expect(body.teams[2].enabled).toBe(false)
  })

  it('renders a Discover Boards button', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const discoverButton = wrapper.findAll('button').find(b => b.text().includes('Discover'))
    expect(discoverButton.exists()).toBe(true)
  })

  it('calls discover-boards endpoint when Discover Boards is clicked', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const discoverButton = wrapper.findAll('button').find(b => b.text().includes('Discover'))
    await discoverButton.trigger('click')
    await flushPromises()

    const discoverCall = fetch.mock.calls.find(
      ([url, opts]) => url.endsWith('/discover-boards') && opts?.method === 'POST'
    )
    expect(discoverCall).toBeTruthy()
  })

  it('reloads teams after discover-boards completes', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    // Reset to track new calls
    const callCountBefore = fetch.mock.calls.filter(
      ([url, opts]) => url.endsWith('/teams') && (!opts || opts.method === 'GET' || !opts.method)
    ).length

    const discoverButton = wrapper.findAll('button').find(b => b.text().includes('Discover'))
    await discoverButton.trigger('click')
    await flushPromises()

    const callCountAfter = fetch.mock.calls.filter(
      ([url, opts]) => url.endsWith('/teams') && (!opts || opts.method === 'GET' || !opts.method)
    ).length

    // Should have made another GET /teams call after discover
    expect(callCountAfter).toBeGreaterThan(callCountBefore)
  })

  it('shows empty state when no teams exist', async () => {
    fetch.mockImplementation((url, options) => {
      if (url.endsWith('/teams') && (!options || options.method === 'GET' || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ teams: [] })
        })
      }
      if (url.endsWith('/discover-boards') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true })
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })

    const wrapper = mount(BoardSettings)
    await flushPromises()

    expect(wrapper.text()).toContain('No boards found')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  })

  describe('staleness indicators', () => {
    const staleTeams = [
      { boardId: 1, boardName: 'RHOAIENG - Alpha', displayName: 'Alpha', enabled: true, stale: false, lastSprintEndDate: '2026-01-15T00:00:00Z', manuallyConfigured: false },
      { boardId: 2, boardName: 'RHOAIENG - Beta', displayName: 'Beta', enabled: true, stale: false, lastSprintEndDate: null, manuallyConfigured: false },
      { boardId: 3, boardName: 'RHOAIENG - Gamma', displayName: 'Gamma', enabled: false, stale: true, lastSprintEndDate: '2025-08-01T00:00:00Z', manuallyConfigured: false },
      { boardId: 4, boardName: 'RHOAIENG - Delta', displayName: 'Delta', enabled: false, stale: true, lastSprintEndDate: null, manuallyConfigured: false }
    ]

    function mountWithStaleTeams() {
      fetch.mockImplementation((url, options) => {
        if (url.endsWith('/teams') && (!options || options.method === 'GET' || !options.method)) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ teams: staleTeams })
          })
        }
        if (url.endsWith('/teams') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true })
          })
        }
        if (url.endsWith('/discover-boards') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, boardCount: 4, staleCount: 2 })
          })
        }
        return Promise.reject(new Error(`Unknown URL: ${url}`))
      })
    }

    it('shows "Inactive" badge on stale boards', async () => {
      mountWithStaleTeams()
      const wrapper = mount(BoardSettings)
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="team-row"]')
      // Gamma and Delta are stale (sorted to bottom)
      const gammaRow = rows.find(r => r.text().includes('Gamma'))
      const deltaRow = rows.find(r => r.text().includes('Delta'))
      const alphaRow = rows.find(r => r.text().includes('Alpha'))

      expect(gammaRow.text()).toContain('Inactive')
      expect(deltaRow.text()).toContain('Inactive')
      expect(alphaRow.text()).not.toContain('Inactive')
    })

    it('shows "Last sprint ended" text for stale boards with dates', async () => {
      mountWithStaleTeams()
      const wrapper = mount(BoardSettings)
      await flushPromises()

      const gammaRow = wrapper.findAll('[data-testid="team-row"]').find(r => r.text().includes('Gamma'))
      expect(gammaRow.text()).toMatch(/Last sprint ended/)
    })

    it('shows "No sprints found" for stale boards without dates', async () => {
      mountWithStaleTeams()
      const wrapper = mount(BoardSettings)
      await flushPromises()

      const deltaRow = wrapper.findAll('[data-testid="team-row"]').find(r => r.text().includes('Delta'))
      expect(deltaRow.text()).toContain('No sprints found')
    })

    it('sorts stale boards to the bottom', async () => {
      mountWithStaleTeams()
      const wrapper = mount(BoardSettings)
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="team-row"]')
      // Active boards first (Alpha, Beta), then stale (Gamma, Delta)
      expect(rows[0].text()).toContain('Alpha')
      expect(rows[1].text()).toContain('Beta')
      expect(rows[2].text()).toContain('Gamma')
      expect(rows[3].text()).toContain('Delta')
    })

    it('applies reduced opacity to stale rows', async () => {
      mountWithStaleTeams()
      const wrapper = mount(BoardSettings)
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="team-row"]')
      const gammaRow = rows.find(r => r.text().includes('Gamma'))
      const alphaRow = rows.find(r => r.text().includes('Alpha'))

      expect(gammaRow.classes()).toContain('opacity-60')
      expect(alphaRow.classes()).not.toContain('opacity-60')
    })
  })

  it('displays board ID alongside board name', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    // Should show board IDs
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('3')
  })

  it('emits saved event after successful save', async () => {
    const wrapper = mount(BoardSettings)
    await flushPromises()

    const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
    await saveButton.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('saved')).toBeTruthy()
  })
})
