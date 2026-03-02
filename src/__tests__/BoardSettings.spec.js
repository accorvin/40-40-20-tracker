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

const mockProjects = [
  { key: 'RHOAIENG', name: 'OpenShift AI Engineering', pillar: 'OpenShift AI' },
  { key: 'RHAISTRAT', name: 'AI Strategy', pillar: 'AI Platform' }
]

const mockTeams = [
  { boardId: 1, boardName: 'RHOAIENG - Alpha', displayName: 'Alpha', enabled: true },
  { boardId: 2, boardName: 'RHOAIENG - Beta', displayName: 'Beta', enabled: true },
  { boardId: 3, boardName: 'RHOAIENG - Gamma', displayName: 'Gamma', enabled: false }
]

function setupFetchMock(overrides = {}) {
  fetch.mockImplementation((url, options) => {
    if (url.endsWith('/teams') && (!options || options.method === 'GET' || !options.method)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ teams: overrides.teams ?? mockTeams })
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
    if (url.endsWith('/projects') && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true })
      })
    }
    return Promise.reject(new Error(`Unknown URL: ${url}`))
  })
}

describe('BoardSettings', () => {
  beforeEach(() => {
    fetch.mockReset()
    setupFetchMock()
  })

  describe('Tabs', () => {
    it('renders two tabs: Projects and Boards', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const tabs = wrapper.findAll('[data-testid="settings-tab"]')
      expect(tabs).toHaveLength(2)
      expect(tabs[0].text()).toBe('Projects')
      expect(tabs[1].text()).toBe('Boards')
    })

    it('shows Projects tab by default', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      expect(wrapper.find('[data-testid="projects-tab-content"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="boards-tab-content"]').exists()).toBe(false)
    })

    it('switches to Boards tab when clicked', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const tabs = wrapper.findAll('[data-testid="settings-tab"]')
      await tabs[1].trigger('click')

      expect(wrapper.find('[data-testid="projects-tab-content"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="boards-tab-content"]').exists()).toBe(true)
    })
  })

  describe('Projects tab', () => {
    it('displays existing projects', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      expect(wrapper.text()).toContain('RHOAIENG')
      expect(wrapper.text()).toContain('OpenShift AI Engineering')
      expect(wrapper.text()).toContain('OpenShift AI')
      expect(wrapper.text()).toContain('RHAISTRAT')
      expect(wrapper.text()).toContain('AI Strategy')
      expect(wrapper.text()).toContain('AI Platform')
    })

    it('shows Add Project button', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const addButton = wrapper.find('[data-testid="add-project-btn"]')
      expect(addButton.exists()).toBe(true)
    })

    it('shows inline form when Add Project is clicked', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      await wrapper.find('[data-testid="add-project-btn"]').trigger('click')

      const form = wrapper.find('[data-testid="new-project-form"]')
      expect(form.exists()).toBe(true)
      expect(form.findAll('input')).toHaveLength(3) // key, name, pillar
    })

    it('validates required fields on add', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      await wrapper.find('[data-testid="add-project-btn"]').trigger('click')

      // Try to confirm without filling fields
      await wrapper.find('[data-testid="confirm-add-project"]').trigger('click')

      // Should still show the form (not added)
      expect(wrapper.find('[data-testid="new-project-form"]').exists()).toBe(true)
    })

    it('adds a new project to the list', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      await wrapper.find('[data-testid="add-project-btn"]').trigger('click')

      const inputs = wrapper.find('[data-testid="new-project-form"]').findAll('input')
      await inputs[0].setValue('NEWPROJ')
      await inputs[1].setValue('New Project')
      await inputs[2].setValue('New Pillar')

      await wrapper.find('[data-testid="confirm-add-project"]').trigger('click')

      expect(wrapper.text()).toContain('NEWPROJ')
      expect(wrapper.text()).toContain('New Project')
      expect(wrapper.text()).toContain('New Pillar')
    })

    it('edit project allows changing name and pillar', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const editButtons = wrapper.findAll('[data-testid="edit-project-btn"]')
      await editButtons[0].trigger('click')

      // Should have editable inputs for the first project
      const editRow = wrapper.find('[data-testid="edit-project-form"]')
      expect(editRow.exists()).toBe(true)

      const inputs = editRow.findAll('input')
      // Name and pillar inputs (key is read-only text)
      await inputs[0].setValue('Updated Name')
      await inputs[1].setValue('Updated Pillar')

      await wrapper.find('[data-testid="confirm-edit-project"]').trigger('click')

      expect(wrapper.text()).toContain('Updated Name')
      expect(wrapper.text()).toContain('Updated Pillar')
      // Key should still be the same
      expect(wrapper.text()).toContain('RHOAIENG')
    })

    it('delete project removes from list', async () => {
      // Mock window.confirm
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const deleteButtons = wrapper.findAll('[data-testid="delete-project-btn"]')
      await deleteButtons[1].trigger('click') // Delete RHAISTRAT

      expect(wrapper.text()).not.toContain('RHAISTRAT')
      expect(wrapper.text()).toContain('RHOAIENG')

      window.confirm.mockRestore()
    })

    it('delete project does nothing if confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const deleteButtons = wrapper.findAll('[data-testid="delete-project-btn"]')
      await deleteButtons[1].trigger('click')

      expect(wrapper.text()).toContain('RHAISTRAT')

      window.confirm.mockRestore()
    })

    it('save calls POST /projects with updated projects', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const saveButton = wrapper.findAll('button').find(b => b.text() === 'Save')
      await saveButton.trigger('click')
      await flushPromises()

      const saveCall = fetch.mock.calls.find(
        ([url, opts]) => url.endsWith('/projects') && opts?.method === 'POST'
      )
      expect(saveCall).toBeTruthy()

      const body = JSON.parse(saveCall[1].body)
      expect(body.projects).toHaveLength(2)
      expect(body.projects[0].key).toBe('RHOAIENG')
    })

    it('auto-discovers boards for newly added projects after save', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      // Add a new project
      await wrapper.find('[data-testid="add-project-btn"]').trigger('click')
      const inputs = wrapper.find('[data-testid="new-project-form"]').findAll('input')
      await inputs[0].setValue('NEWPROJ')
      await inputs[1].setValue('New Project')
      await inputs[2].setValue('New Pillar')
      await wrapper.find('[data-testid="confirm-add-project"]').trigger('click')

      // Save
      const saveButton = wrapper.findAll('button').find(b => b.text() === 'Save')
      await saveButton.trigger('click')
      await flushPromises()

      // Should have called discover-boards for the new project
      const discoverCall = fetch.mock.calls.find(
        ([url, opts]) => url.endsWith('/discover-boards') && opts?.method === 'POST'
      )
      expect(discoverCall).toBeTruthy()
      const discoverBody = JSON.parse(discoverCall[1].body)
      expect(discoverBody.projectKey).toBe('NEWPROJ')
    })

    it('does not auto-discover boards for existing projects on save', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      // Save without adding new projects
      const saveButton = wrapper.findAll('button').find(b => b.text() === 'Save')
      await saveButton.trigger('click')
      await flushPromises()

      const discoverCall = fetch.mock.calls.find(
        ([url, opts]) => url.endsWith('/discover-boards') && opts?.method === 'POST'
      )
      expect(discoverCall).toBeFalsy()
    })

    it('emits saved event after successful save', async () => {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects } })
      await flushPromises()

      const saveButton = wrapper.findAll('button').find(b => b.text() === 'Save')
      await saveButton.trigger('click')
      await flushPromises()

      expect(wrapper.emitted('saved')).toBeTruthy()
    })
  })

  describe('Boards tab', () => {
    async function mountAndSwitchToBoards(props = {}) {
      const wrapper = mount(BoardSettings, { props: { projects: mockProjects, ...props } })
      await flushPromises()
      const tabs = wrapper.findAll('[data-testid="settings-tab"]')
      await tabs[1].trigger('click')
      await flushPromises()
      return wrapper
    }

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
      const wrapper = await mountAndSwitchToBoards()

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/teams'),
        expect.objectContaining({ method: 'GET' })
      )

      expect(wrapper.text()).toContain('Alpha')
      expect(wrapper.text()).toContain('Beta')
      expect(wrapper.text()).toContain('Gamma')
    })

    it('renders toggle switches for each board', async () => {
      const wrapper = await mountAndSwitchToBoards()

      const toggles = wrapper.findAll('input[type="checkbox"]')
      expect(toggles).toHaveLength(3)
    })

    it('reflects enabled state in toggles', async () => {
      const wrapper = await mountAndSwitchToBoards()

      const toggles = wrapper.findAll('input[type="checkbox"]')
      // Alpha and Beta enabled, Gamma disabled
      expect(toggles[0].element.checked).toBe(true)
      expect(toggles[1].element.checked).toBe(true)
      expect(toggles[2].element.checked).toBe(false)
    })

    it('toggles board enabled state when checkbox is clicked', async () => {
      const wrapper = await mountAndSwitchToBoards()

      const toggles = wrapper.findAll('input[type="checkbox"]')
      // Disable Alpha
      await toggles[0].setValue(false)

      expect(toggles[0].element.checked).toBe(false)
    })

    it('renders a Save button', async () => {
      const wrapper = await mountAndSwitchToBoards()

      const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
      expect(saveButton.exists()).toBe(true)
    })

    it('calls saveTeams with updated teams on Save click', async () => {
      const wrapper = await mountAndSwitchToBoards()

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
      const wrapper = await mountAndSwitchToBoards()

      const discoverButton = wrapper.findAll('button').find(b => b.text().includes('Discover'))
      expect(discoverButton.exists()).toBe(true)
    })

    it('calls discover-boards endpoint when Discover Boards is clicked', async () => {
      const wrapper = await mountAndSwitchToBoards()

      const discoverButton = wrapper.findAll('button').find(b => b.text().includes('Discover'))
      await discoverButton.trigger('click')
      await flushPromises()

      const discoverCall = fetch.mock.calls.find(
        ([url, opts]) => url.endsWith('/discover-boards') && opts?.method === 'POST'
      )
      expect(discoverCall).toBeTruthy()
    })

    it('reloads teams after discover-boards completes', async () => {
      const wrapper = await mountAndSwitchToBoards()

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
      setupFetchMock({ teams: [] })
      const wrapper = await mountAndSwitchToBoards()

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
        setupFetchMock({ teams: staleTeams })
      }

      it('shows "Inactive" badge on stale boards', async () => {
        mountWithStaleTeams()
        const wrapper = await mountAndSwitchToBoards()

        const groups = wrapper.findAll('[data-testid="board-group"]')
        const gammaGroup = groups.find(r => r.text().includes('Gamma'))
        const deltaGroup = groups.find(r => r.text().includes('Delta'))
        const alphaGroup = groups.find(r => r.text().includes('Alpha'))

        expect(gammaGroup.text()).toContain('Inactive')
        expect(deltaGroup.text()).toContain('Inactive')
        expect(alphaGroup.text()).not.toContain('Inactive')
      })

      it('shows "Last sprint ended" text for stale boards with dates', async () => {
        mountWithStaleTeams()
        const wrapper = await mountAndSwitchToBoards()

        const gammaGroup = wrapper.findAll('[data-testid="board-group"]').find(r => r.text().includes('Gamma'))
        expect(gammaGroup.text()).toMatch(/Last sprint ended/)
      })

      it('shows "No sprints found" for stale boards without dates', async () => {
        mountWithStaleTeams()
        const wrapper = await mountAndSwitchToBoards()

        const deltaGroup = wrapper.findAll('[data-testid="board-group"]').find(r => r.text().includes('Delta'))
        expect(deltaGroup.text()).toContain('No sprints found')
      })

      it('sorts stale boards to the bottom', async () => {
        mountWithStaleTeams()
        const wrapper = await mountAndSwitchToBoards()

        const groups = wrapper.findAll('[data-testid="board-group"]')
        // Active boards first (Alpha, Beta), then stale (Gamma, Delta)
        expect(groups[0].text()).toContain('Alpha')
        expect(groups[1].text()).toContain('Beta')
        expect(groups[2].text()).toContain('Gamma')
        expect(groups[3].text()).toContain('Delta')
      })

      it('applies reduced opacity to stale groups', async () => {
        mountWithStaleTeams()
        const wrapper = await mountAndSwitchToBoards()

        const groups = wrapper.findAll('[data-testid="board-group"]')
        const gammaGroup = groups.find(r => r.text().includes('Gamma'))
        const alphaGroup = groups.find(r => r.text().includes('Alpha'))

        expect(gammaGroup.classes()).toContain('opacity-60')
        expect(alphaGroup.classes()).not.toContain('opacity-60')
      })
    })

    it('displays board ID alongside board name', async () => {
      const wrapper = await mountAndSwitchToBoards()

      // Should show board IDs
      expect(wrapper.text()).toContain('1')
      expect(wrapper.text()).toContain('2')
      expect(wrapper.text()).toContain('3')
    })

    it('emits saved event after successful save', async () => {
      const wrapper = await mountAndSwitchToBoards()

      const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
      await saveButton.trigger('click')
      await flushPromises()

      expect(wrapper.emitted('saved')).toBeTruthy()
    })

    describe('sprint filter', () => {
      it('displays existing sprint filter value in sub-team rows', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const filterInputs = wrapper.findAll('[data-testid="sprint-filter-input"]')
        expect(filterInputs).toHaveLength(2)
        expect(filterInputs[0].element.value).toBe('Alpha')
        expect(filterInputs[1].element.value).toBe('Beta')
      })

      it('includes sprintFilter in saved teams data', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const filterInputs = wrapper.findAll('[data-testid="sprint-filter-input"]')
        await filterInputs[0].setValue('Team Alpha')

        const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
        await saveButton.trigger('click')
        await flushPromises()

        const saveCall = fetch.mock.calls.find(
          ([url, opts]) => url.endsWith('/teams') && opts?.method === 'POST'
        )
        const body = JSON.parse(saveCall[1].body)
        expect(body.teams[0].sprintFilter).toBe('Team Alpha')
      })

      it('computes teamId on save', async () => {
        setupFetchMock({
          teams: [
            { boardId: 42, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Team Alpha', teamId: '42_team-alpha' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
        await saveButton.trigger('click')
        await flushPromises()

        const saveCall = fetch.mock.calls.find(
          ([url, opts]) => url.endsWith('/teams') && opts?.method === 'POST'
        )
        const body = JSON.parse(saveCall[1].body)
        expect(body.teams[0].teamId).toBe('42_team-alpha')
      })

      it('sets teamId to String(boardId) when no filter', async () => {
        setupFetchMock({
          teams: [
            { boardId: 42, boardName: 'Board A', displayName: 'Alpha', enabled: true }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
        await saveButton.trigger('click')
        await flushPromises()

        const saveCall = fetch.mock.calls.find(
          ([url, opts]) => url.endsWith('/teams') && opts?.method === 'POST'
        )
        const body = JSON.parse(saveCall[1].body)
        expect(body.teams[0].teamId).toBe('42')
      })
    })

    describe('kanban boards', () => {
      it('shows "Kanban" badge next to kanban board names', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Scrum Board', enabled: true, boardType: 'scrum' },
            { boardId: 2, boardName: 'Board B', displayName: 'Kanban Board', enabled: true, boardType: 'kanban' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const groups = wrapper.findAll('[data-testid="board-group"]')
        const kanbanGroup = groups.find(g => g.text().includes('Kanban Board'))
        const scrumGroup = groups.find(g => g.text().includes('Scrum Board'))

        expect(kanbanGroup.text()).toContain('Kanban')
        expect(kanbanGroup.find('[data-testid="kanban-badge"]').exists()).toBe(true)
        expect(scrumGroup.find('[data-testid="kanban-badge"]').exists()).toBe(false)
      })

      it('hides sprint filter input for kanban boards with sub-teams', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Scrum Board', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha', boardType: 'scrum' },
            { boardId: 1, boardName: 'Scrum Board', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta', boardType: 'scrum' },
            { boardId: 2, boardName: 'Kanban Board', displayName: 'KTeam A', enabled: true, sprintFilter: 'A', teamId: '2_a', boardType: 'kanban' },
            { boardId: 2, boardName: 'Kanban Board', displayName: 'KTeam B', enabled: true, sprintFilter: 'B', teamId: '2_b', boardType: 'kanban' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const groups = wrapper.findAll('[data-testid="board-group"]')
        const scrumGroup = groups.find(g => g.text().includes('ID: 1'))
        const kanbanGroup = groups.find(g => g.text().includes('ID: 2'))

        // Scrum board sub-teams should have sprint filter inputs
        expect(scrumGroup.findAll('[data-testid="sprint-filter-input"]')).toHaveLength(2)
        // Kanban board sub-teams should NOT have sprint filter inputs
        expect(kanbanGroup.findAll('[data-testid="sprint-filter-input"]')).toHaveLength(0)
      })

      it('does not show "Kanban" badge for boards without boardType', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Default Board', enabled: true }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        expect(wrapper.find('[data-testid="kanban-badge"]').exists()).toBe(false)
      })
    })

    describe('sub-teams', () => {
      it('renders an "Add Sub-Team" button per board group', async () => {
        const wrapper = await mountAndSwitchToBoards()

        const addButtons = wrapper.findAll('[data-testid="add-sub-team-btn"]')
        // 3 unique boards = 3 add buttons (one per board group header)
        expect(addButtons).toHaveLength(3)
      })

      it('converts single entry to two sub-team rows on Add Sub-Team click', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const addBtn = wrapper.find('[data-testid="add-sub-team-btn"]')
        await addBtn.trigger('click')

        // Should now have 2 sub-team rows
        const rows = wrapper.findAll('[data-testid="sub-team-row"]')
        expect(rows).toHaveLength(2)

        // Both should have name and filter inputs
        const nameInputs = wrapper.findAll('[data-testid="sub-team-name-input"]')
        expect(nameInputs).toHaveLength(2)
        const filterInputs = wrapper.findAll('[data-testid="sprint-filter-input"]')
        expect(filterInputs).toHaveLength(2)
      })

      it('groups sub-teams under their parent board', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' },
            { boardId: 2, boardName: 'Board B', displayName: 'Gamma', enabled: true }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        // 2 board groups
        const groups = wrapper.findAll('[data-testid="board-group"]')
        expect(groups).toHaveLength(2)

        // First group should have 2 sub-team rows
        const firstGroupSubTeams = groups[0].findAll('[data-testid="sub-team-row"]')
        expect(firstGroupSubTeams).toHaveLength(2)

        // Second group should have no sub-team rows (simple single entry)
        const secondGroupSubTeams = groups[1].findAll('[data-testid="sub-team-row"]')
        expect(secondGroupSubTeams).toHaveLength(0)
      })

      it('shows Remove button on each sub-team row', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const removeButtons = wrapper.findAll('[data-testid="remove-sub-team-btn"]')
        expect(removeButtons).toHaveLength(2)
      })

      it('removes a sub-team entry when Remove is clicked', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const removeButtons = wrapper.findAll('[data-testid="remove-sub-team-btn"]')
        await removeButtons[1].trigger('click')

        // Should have one sub-team row remaining (still has a filter)
        const subTeamRows = wrapper.findAll('[data-testid="sub-team-row"]')
        expect(subTeamRows).toHaveLength(1)
        expect(wrapper.findAll('[data-testid="sprint-filter-input"]')[0].element.value).toBe('Alpha')
      })

      it('renders a name input per sub-team row', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const nameInputs = wrapper.findAll('[data-testid="sub-team-name-input"]')
        expect(nameInputs).toHaveLength(2)
        expect(nameInputs[0].element.value).toBe('Alpha')
        expect(nameInputs[1].element.value).toBe('Beta')
      })

      it('saves sub-team name as displayName', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        const nameInputs = wrapper.findAll('[data-testid="sub-team-name-input"]')
        await nameInputs[0].setValue('Team Alpha Renamed')

        const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
        await saveButton.trigger('click')
        await flushPromises()

        const saveCall = fetch.mock.calls.find(
          ([url, opts]) => url.endsWith('/teams') && opts?.method === 'POST'
        )
        const body = JSON.parse(saveCall[1].body)
        expect(body.teams[0].displayName).toBe('Team Alpha Renamed')
      })

      it('prevents save when sub-team name is empty', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        // Clear the first name
        const nameInputs = wrapper.findAll('[data-testid="sub-team-name-input"]')
        await nameInputs[0].setValue('')

        const saveButton = wrapper.findAll('button').find(b => b.text().includes('Save'))
        await saveButton.trigger('click')
        await flushPromises()

        // Should NOT have called POST /teams
        const saveCall = fetch.mock.calls.find(
          ([url, opts]) => url.endsWith('/teams') && opts?.method === 'POST'
        )
        expect(saveCall).toBeFalsy()

        // Should show validation error
        expect(wrapper.text()).toContain('sub-team entries require a name')
      })

      it('toggles sub-teams independently', async () => {
        setupFetchMock({
          teams: [
            { boardId: 1, boardName: 'Board A', displayName: 'Alpha', enabled: true, sprintFilter: 'Alpha', teamId: '1_alpha' },
            { boardId: 1, boardName: 'Board A', displayName: 'Beta', enabled: true, sprintFilter: 'Beta', teamId: '1_beta' }
          ]
        })
        const wrapper = await mountAndSwitchToBoards()

        // Toggle only the first sub-team off
        const toggles = wrapper.findAll('input[type="checkbox"]')
        await toggles[0].setValue(false)

        // First should be unchecked, second still checked
        expect(toggles[0].element.checked).toBe(false)
        expect(toggles[1].element.checked).toBe(true)
      })
    })
  })
})
