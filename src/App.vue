<template>
  <AuthGuard>
    <div id="app" class="min-h-screen bg-gray-50">
      <header class="bg-primary-700 text-white shadow-lg">
        <div class="container mx-auto px-6 py-2 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="/redhat-logo.svg" alt="Red Hat" class="h-8" />
            <h1 class="text-xl font-bold">40-40-20 Sprint Allocation Tracker</h1>
          </div>
          <div class="flex items-center gap-4">
            <div v-if="lastUpdated" class="text-sm flex items-center gap-1.5" :class="isDataStale ? 'text-amber-300' : 'text-primary-100'">
              <svg v-if="isDataStale" data-testid="stale-icon" class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
              Last Updated: {{ formatDate(lastUpdated) }}
            </div>
            <button
              @click="currentView = 'board-settings'"
              class="p-1 text-primary-100 hover:text-white transition-colors"
              title="Board Settings"
            >
              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <div class="relative">
              <div class="flex items-stretch">
                <button
                  @click="refreshData(false)"
                  :disabled="isRefreshing"
                  class="px-3 py-1 text-sm bg-white text-primary-700 rounded-l-md font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <svg
                    class="h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
                <button
                  @click="showRefreshMenu = !showRefreshMenu"
                  :disabled="isRefreshing"
                  class="px-1.5 py-1 text-sm bg-white text-primary-700 rounded-r-md font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-l border-primary-200"
                >
                  <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              <div
                v-if="showRefreshMenu"
                class="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg py-1 z-10"
              >
                <button
                  @click="refreshData(false); showRefreshMenu = false"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Refresh
                </button>
                <button
                  @click="refreshData(true); showRefreshMenu = false"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Full Refresh
                </button>
              </div>
            </div>

            <!-- User Avatar and Sign Out -->
            <div class="relative" v-if="authUser">
              <button
                @click="showUserMenu = !showUserMenu"
                class="flex items-center gap-2 hover:bg-primary-600 rounded-full p-1 transition-colors"
              >
                <div
                  v-if="!authUser.photoURL || avatarLoadError"
                  class="h-8 w-8 rounded-full border-2 border-white bg-white text-primary-700 flex items-center justify-center font-bold text-xs"
                >
                  {{ getUserInitials(authUser) }}
                </div>
                <img
                  v-else
                  :src="authUser.photoURL"
                  :alt="authUser.displayName || authUser.email"
                  class="h-8 w-8 rounded-full border-2 border-white"
                  @error="avatarLoadError = true"
                />
              </button>

              <!-- Dropdown menu -->
              <div
                v-if="showUserMenu"
                class="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-10"
              >
                <div class="px-4 py-2 border-b border-gray-200">
                  <p class="text-sm font-medium text-gray-900">{{ authUser.displayName }}</p>
                  <p class="text-xs text-gray-500 truncate">{{ authUser.email }}</p>
                </div>
                <button
                  @click="handleSignOut"
                  class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Org Dashboard View (multi-project) -->
      <main v-if="currentView === 'org-dashboard'" class="relative">
        <OrgDashboard
          :orgName="orgName"
          :orgSummary="orgSummary"
          :projects="projects"
          :projectSummaries="projectSummaries"
          @select-project="handleSelectProject"
        />
        <LoadingOverlay v-if="isLoading" />
      </main>

      <!-- Legacy Dashboard View (single project, shown when only 1 project) -->
      <main v-else-if="currentView === 'dashboard'" class="relative">
        <div class="container mx-auto px-6 pt-4">
          <FilterSelector
            :filters="filters"
            :activeFilterId="activeFilterId"
            @select-filter="setActiveFilter"
            @create-filter="openCreateFilter"
            @edit-filter="openEditFilter"
            @delete-filter="handleDeleteFilter"
          />
        </div>

        <DashboardGrid
          :boards="filteredBoards"
          :boardSprintData="boardSprintData"
          @select-team="handleSelectTeam"
        />

        <LoadingOverlay v-if="isLoading" />
      </main>

      <!-- Project Detail View -->
      <main v-else-if="currentView === 'project-detail'">
        <ProjectDetail
          :project="selectedProject"
          :projectSummary="selectedProjectSummary"
          :boards="boards"
          :boardSprintData="boardSprintData"
          :isLoading="isLoading"
          :filters="filters"
          :activeFilterId="activeFilterId"
          :activeFilter="activeFilter"
          @back="handleBackToOrg"
          @select-team="handleSelectTeam"
          @select-filter="setActiveFilter"
          @create-filter="openCreateFilter"
          @edit-filter="openEditFilter"
          @delete-filter="handleDeleteFilter"
        />
      </main>

      <!-- Team Detail View -->
      <main v-else-if="currentView === 'team-detail'">
        <TeamDetail
          :board="selectedTeam"
          :sprints="teamSprints"
          :selectedSprint="selectedSprint"
          :sprintData="teamSprintData"
          :isLoading="isTeamDetailLoading"
          @select-sprint="handleSelectSprint"
          @back="handleBackFromTeamDetail"
        />
      </main>

      <!-- Board Settings View -->
      <main v-else-if="currentView === 'board-settings'">
        <BoardSettings
          :projects="projects"
          @back="handleBackFromSettings"
          @saved="handleSettingsSaved"
        />
      </main>

      <FilterEditor
        v-if="showFilterEditor"
        :boards="boards"
        :filter="editingFilter"
        @save="handleSaveFilter"
        @cancel="showFilterEditor = false"
      />

      <Toast
        v-for="toast in toasts"
        :key="toast.id"
        :message="toast.message"
        :type="toast.type"
        :duration="toast.duration"
        @close="removeToast(toast.id)"
      />
    </div>
  </AuthGuard>
</template>

<script>
import AuthGuard from './components/AuthGuard.vue'
import BoardSettings from './components/BoardSettings.vue'
import DashboardGrid from './components/DashboardGrid.vue'
import FilterEditor from './components/FilterEditor.vue'
import FilterSelector from './components/FilterSelector.vue'
import LoadingOverlay from './components/LoadingOverlay.vue'
import OrgDashboard from './components/OrgDashboard.vue'
import ProjectDetail from './components/ProjectDetail.vue'
import TeamDetail from './components/TeamDetail.vue'
import Toast from './components/Toast.vue'
import { useAuth } from './composables/useAuth'
import { useSavedFilters } from './composables/useSavedFilters'
import {
  refreshData as apiRefreshData,
  getBoards,
  getDashboardSummary,
  getSprintsForBoard,
  getSprintIssues,
  getProjects,
  getOrgSummary,
  getProjectSummary
} from './services/api'

export default {
  name: 'App',
  components: {
    AuthGuard,
    BoardSettings,
    DashboardGrid,
    FilterEditor,
    FilterSelector,
    LoadingOverlay,
    OrgDashboard,
    ProjectDetail,
    TeamDetail,
    Toast
  },
  setup() {
    const { user: authUser, signOut } = useAuth()
    const { filters, activeFilterId, activeFilter, createFilter, updateFilter, deleteFilter, setActiveFilter } = useSavedFilters()
    return {
      authUser,
      signOut,
      filters,
      activeFilterId,
      activeFilter,
      createFilter,
      updateFilter,
      deleteFilter,
      setActiveFilter
    }
  },
  data() {
    return {
      currentView: 'org-dashboard',
      // Multi-project state
      orgName: 'AI Engineering',
      projects: [],
      orgSummary: null,
      projectSummaries: {},
      selectedProject: null,
      selectedProjectSummary: null,
      isMultiProject: false,
      // Board/team state
      boards: [],
      boardSprintData: {},
      selectedTeam: null,
      teamSprints: [],
      selectedSprint: null,
      teamSprintData: null,
      isTeamDetailLoading: false,
      lastUpdated: null,
      isRefreshing: false,
      isLoading: false,
      isInitialized: false,
      showUserMenu: false,
      showRefreshMenu: false,
      avatarLoadError: false,
      toasts: [],
      showFilterEditor: false,
      editingFilter: null
    }
  },
  computed: {
    filteredBoards() {
      if (!this.activeFilter) return this.boards
      return this.boards.filter(b => this.activeFilter.boardIds.includes(b.id))
    },
    isDataStale() {
      if (!this.lastUpdated) return false
      const age = Date.now() - new Date(this.lastUpdated).getTime()
      return age > 60 * 60 * 1000 // 1 hour
    }
  },
  watch: {
    authUser(newUser, oldUser) {
      this.avatarLoadError = false

      if (newUser && !oldUser) {
        this.loadInitialData()
      }
    }
  },
  mounted() {
    document.addEventListener('click', this.handleClickOutside)

    if (this.authUser) {
      this.loadInitialData()
    }
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutside)
  },
  methods: {
    async loadInitialData() {
      this.isLoading = true
      try {
        // Load org config to determine single vs multi-project mode
        const orgConfig = await getProjects()
        this.orgName = orgConfig.orgName || 'AI Engineering'
        this.projects = orgConfig.projects || []
        this.isMultiProject = this.projects.length > 1

        if (this.isMultiProject) {
          // Multi-project mode: show org dashboard
          this.currentView = 'org-dashboard'
          await this.loadOrgData()
        } else {
          // Single project mode: show legacy dashboard directly
          this.currentView = 'dashboard'
          await Promise.all([this.loadBoards(), this.loadDashboardSummary()])
        }
      } catch (error) {
        console.error('Failed to load initial data:', error)
        // Fallback to single project mode
        this.currentView = 'dashboard'
        await Promise.all([this.loadBoards(), this.loadDashboardSummary()])
      } finally {
        this.isLoading = false
      }
    },

    async loadOrgData() {
      try {
        const [orgSummary, ...projectSummaries] = await Promise.all([
          getOrgSummary(),
          ...this.projects.map(p => getProjectSummary(p.key).then(s => ({ key: p.key, summary: s })))
        ])
        this.orgSummary = orgSummary
        for (const { key, summary } of projectSummaries) {
          this.projectSummaries[key] = summary
        }
        if (orgSummary?.lastUpdated) {
          this.lastUpdated = orgSummary.lastUpdated
        }
      } catch (error) {
        console.error('Failed to load org data:', error)
      }
    },

    async handleSelectProject(project) {
      this.selectedProject = project
      this.currentView = 'project-detail'
      this.isLoading = true
      try {
        const [boardsData, summaryData] = await Promise.all([
          getBoards(project.key),
          getProjectSummary(project.key)
        ])
        this.boards = boardsData.boards || []
        this.selectedProjectSummary = summaryData
        this.boardSprintData = summaryData?.boards || {}
        if (summaryData?.lastUpdated) {
          this.lastUpdated = summaryData.lastUpdated
        }
      } catch (error) {
        console.error('Failed to load project data:', error)
        this.boards = []
      } finally {
        this.isLoading = false
      }
    },

    handleBackToOrg() {
      this.currentView = 'org-dashboard'
      this.selectedProject = null
      this.boards = []
      this.boardSprintData = {}
    },

    handleBackFromTeamDetail() {
      if (this.isMultiProject && this.selectedProject) {
        this.currentView = 'project-detail'
      } else {
        this.currentView = 'dashboard'
      }
    },

    handleBackFromSettings() {
      if (this.isMultiProject) {
        this.currentView = this.selectedProject ? 'project-detail' : 'org-dashboard'
      } else {
        this.currentView = 'dashboard'
      }
    },

    async loadBoards(projectKey) {
      try {
        const data = await getBoards(projectKey)
        this.boards = data.boards || []
        this.lastUpdated = data.lastUpdated || null
      } catch (error) {
        console.error('Failed to load boards:', error)
        this.boards = []
      }
      this.isInitialized = true
    },

    async loadDashboardSummary() {
      try {
        const data = await getDashboardSummary()
        if (data && data.boards) {
          this.boardSprintData = data.boards
          if (data.lastUpdated) {
            this.lastUpdated = data.lastUpdated
          }
        }
      } catch (error) {
        console.error('Failed to load dashboard summary:', error)
      }
    },

    handleSelectTeam(board) {
      this.selectedTeam = board
      this.teamSprints = []
      this.selectedSprint = null
      this.teamSprintData = null
      this.currentView = 'team-detail'
      localStorage.setItem('selectedTeam', JSON.stringify({ id: board.id, name: board.name }))
      this.loadTeamSprints(board.id)
    },

    async loadTeamSprints(boardId) {
      this.isTeamDetailLoading = true
      try {
        const projectKey = this.selectedProject?.key
        const data = await getSprintsForBoard(boardId, { projectKey })
        this.teamSprints = data.sprints || []

        // Restore previously selected sprint, or default to active/most recent closed
        const savedSprintId = this.getSavedSprintId(boardId)
        const savedSprint = savedSprintId ? this.teamSprints.find(s => s.id === savedSprintId) : null
        const activeSprint = this.teamSprints.find(s => s.state === 'active')
        const selectedSprint = savedSprint || activeSprint || [...this.teamSprints]
          .filter(s => s.state === 'closed')
          .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || null

        if (selectedSprint) {
          this.selectedSprint = selectedSprint
          await this.loadSprintIssues(selectedSprint.id)
        }
      } catch (error) {
        console.error('Failed to load team sprints:', error)
      } finally {
        this.isTeamDetailLoading = false
      }
    },

    async loadSprintIssues(sprintId) {
      try {
        const projectKey = this.selectedProject?.key
        const data = await getSprintIssues(sprintId, { projectKey })
        this.teamSprintData = this.transformSprintData(data)
      } catch (error) {
        console.error('Failed to load sprint issues:', error)
        this.teamSprintData = null
      }
    },

    transformSprintData(data) {
      // Group flat issues array by bucket
      const issuesByBucket = { 'tech-debt-quality': [], 'new-features': [], 'learning-enablement': [], 'uncategorized': [] }
      for (const issue of (data.issues || [])) {
        const bucket = issuesByBucket[issue.bucket]
        if (bucket) bucket.push(issue)
      }

      // Add percentage and completedPoints to summary
      const summary = { ...data.summary }
      const totalPoints = summary.totalPoints || 0

      let completedPoints = 0
      if (summary.buckets) {
        summary.buckets = Object.fromEntries(
          Object.entries(summary.buckets).map(([key, bucket]) => {
            completedPoints += bucket.completedPoints || 0
            return [key, {
              ...bucket,
              percentage: totalPoints > 0 ? Math.round((bucket.points / totalPoints) * 100) : 0
            }]
          })
        )
      }
      summary.completedPoints = completedPoints

      return {
        sprint: {
          id: data.sprintId,
          name: data.sprintName,
          state: data.sprintState,
          startDate: data.startDate,
          endDate: data.endDate
        },
        summary,
        issues: issuesByBucket
      }
    },

    async handleSelectSprint(sprintId) {
      this.selectedSprint = this.teamSprints.find(s => s.id === sprintId) || null
      if (this.selectedTeam) {
        this.saveSprintId(this.selectedTeam.id, sprintId)
      }
      this.teamSprintData = null
      this.isTeamDetailLoading = true
      try {
        await this.loadSprintIssues(sprintId)
      } finally {
        this.isTeamDetailLoading = false
      }
    },

    getSavedSprintId(boardId) {
      try {
        const saved = JSON.parse(localStorage.getItem('selectedSprints') || '{}')
        return saved[boardId] || null
      } catch {
        return null
      }
    },

    saveSprintId(boardId, sprintId) {
      try {
        const saved = JSON.parse(localStorage.getItem('selectedSprints') || '{}')
        saved[boardId] = sprintId
        localStorage.setItem('selectedSprints', JSON.stringify(saved))
      } catch {
        // Ignore localStorage errors
      }
    },

    async refreshData(hardRefresh) {
      this.isRefreshing = true

      try {
        const projectKey = this.selectedProject?.key || (this.projects.length === 1 ? this.projects[0]?.key : 'RHOAIENG')
        await apiRefreshData(projectKey, { hardRefresh })
        this.showToast(
          hardRefresh
            ? 'Full refresh started — data will update in the background'
            : 'Refresh started — data will update in the background'
        )
      } catch (error) {
        console.error('Refresh error:', error)

        if (error.message.includes('Authentication')) {
          alert('Your session has expired. Please refresh the page and sign in again.')
        } else {
          alert(`Failed to start refresh: ${error.message}`)
        }
      } finally {
        this.isRefreshing = false
      }
    },

    async handleSettingsSaved() {
      this.showToast('Board settings saved')
      if (this.isMultiProject) {
        if (this.selectedProject) {
          this.currentView = 'project-detail'
          await this.handleSelectProject(this.selectedProject)
        } else {
          this.currentView = 'org-dashboard'
          await this.loadOrgData()
        }
      } else {
        this.currentView = 'dashboard'
        await Promise.all([this.loadBoards(), this.loadDashboardSummary()])
      }
    },

    async handleSignOut() {
      this.showUserMenu = false
      await this.signOut()
    },

    handleClickOutside(event) {
      if (!event.target.closest('.relative')) {
        this.showUserMenu = false
        this.showRefreshMenu = false
      }
    },

    formatDate(dateString) {
      const date = new Date(dateString)
      return date.toLocaleString()
    },

    showToast(message, type = 'success', duration = 3000) {
      const id = Date.now()
      this.toasts.push({ id, message, type, duration })
    },

    removeToast(id) {
      this.toasts = this.toasts.filter(t => t.id !== id)
    },

    openCreateFilter() {
      this.editingFilter = null
      this.showFilterEditor = true
    },

    openEditFilter(id) {
      this.editingFilter = this.filters.find(f => f.id === id) || null
      this.showFilterEditor = true
    },

    handleSaveFilter({ name, boardIds }) {
      if (this.editingFilter) {
        this.updateFilter(this.editingFilter.id, { name, boardIds })
      } else {
        this.createFilter({ name, boardIds })
      }
      this.showFilterEditor = false
      this.editingFilter = null
    },

    handleDeleteFilter(id) {
      this.deleteFilter(id)
    },

    getUserInitials(user) {
      if (!user) return '?'

      if (user.displayName) {
        const parts = user.displayName.split(' ')
        if (parts.length >= 2) {
          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        }
        return user.displayName.substring(0, 2).toUpperCase()
      }

      if (user.email) {
        return user.email.substring(0, 2).toUpperCase()
      }

      return '??'
    }
  }
}
</script>
