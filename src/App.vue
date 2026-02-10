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
            <div v-if="lastUpdated" class="text-sm text-primary-100">
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
            <button
              @click="refreshData"
              :disabled="isRefreshing"
              class="px-3 py-1 text-sm bg-white text-primary-700 rounded-md font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <svg
                v-if="isRefreshing"
                class="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg
                v-else
                class="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ isRefreshing ? 'Refreshing...' : 'Refresh' }}
            </button>

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

      <!-- Dashboard View -->
      <main v-if="currentView === 'dashboard'" class="relative">
        <DashboardGrid
          :boards="boards"
          :boardSprintData="boardSprintData"
          @select-team="handleSelectTeam"
        />

        <LoadingOverlay v-if="isLoading || isRefreshing" />
      </main>

      <!-- Team Detail View (placeholder for Phase 5) -->
      <main v-else-if="currentView === 'team-detail'" class="container mx-auto px-6 py-6">
        <button
          @click="currentView = 'dashboard'"
          class="mb-4 text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
        >
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 class="text-xl font-bold text-gray-900">{{ selectedTeam?.displayName || selectedTeam?.name }}</h2>
          <p class="text-gray-500 mt-2">Team detail view coming in Phase 5.</p>
        </div>
      </main>

      <!-- Board Settings View -->
      <main v-else-if="currentView === 'board-settings'">
        <BoardSettings
          @back="currentView = 'dashboard'"
          @saved="handleSettingsSaved"
        />
      </main>

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
import LoadingOverlay from './components/LoadingOverlay.vue'
import Toast from './components/Toast.vue'
import { useAuth } from './composables/useAuth'
import { refreshData as apiRefreshData, getBoards, getSprintsForBoard, getSprintIssues } from './services/api'

export default {
  name: 'App',
  components: {
    AuthGuard,
    BoardSettings,
    DashboardGrid,
    LoadingOverlay,
    Toast
  },
  setup() {
    const { user: authUser, signOut } = useAuth()
    return {
      authUser,
      signOut
    }
  },
  data() {
    return {
      currentView: 'dashboard',
      boards: [],
      boardSprintData: {},
      selectedTeam: null,
      lastUpdated: null,
      isRefreshing: false,
      isLoading: false,
      isInitialized: false,
      showUserMenu: false,
      avatarLoadError: false,
      toasts: []
    }
  },
  watch: {
    currentView(newView) {
      if (newView !== 'dashboard') {
        this.cancelSprintLoading()
      }
    },
    authUser(newUser, oldUser) {
      this.avatarLoadError = false

      if (newUser && !oldUser) {
        this.isLoading = true
        this.loadBoards().then(() => {
          if (this.currentView === 'dashboard') {
            this.loadBoardSprints().catch(() => {})
          }
        }).catch(() => {}).finally(() => {
          this.isLoading = false
        })
      }
    }
  },
  mounted() {
    document.addEventListener('click', this.handleClickOutside)

    // Load initial data if user is already authenticated
    if (this.authUser) {
      this.isLoading = true
      this.loadBoards().then(() => {
        if (this.currentView === 'dashboard') {
          this.loadBoardSprints().catch(() => {})
        }
      }).catch(() => {}).finally(() => {
        this.isLoading = false
      })
    }
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutside)
    this.cancelSprintLoading()
  },
  methods: {
    async loadBoards() {
      try {
        const data = await getBoards()
        this.boards = data.boards || []
        this.lastUpdated = data.lastUpdated || null
      } catch (error) {
        console.error('Failed to load boards:', error)

        if (!error.message.includes('Authentication')) {
          // Silently handle - boards will be empty, user can click Refresh
        }

        this.boards = []
      }
      this.isInitialized = true
    },

    cancelSprintLoading() {
      if (this._sprintAbortController) {
        this._sprintAbortController.abort()
        this._sprintAbortController = null
      }
    },

    async loadBoardSprints() {
      if (this.boards.length === 0 || this.currentView !== 'dashboard') return

      this.cancelSprintLoading()
      this._sprintAbortController = new AbortController()
      const { signal } = this._sprintAbortController

      const CONCURRENCY = 2
      const sprintData = {}

      for (let i = 0; i < this.boards.length; i += CONCURRENCY) {
        if (signal.aborted || this.currentView !== 'dashboard') return

        const chunk = this.boards.slice(i, i + CONCURRENCY)
        const results = await Promise.all(
          chunk.map(async (board) => {
            try {
              const { sprints } = await getSprintsForBoard(board.id, { signal })
              const activeSprint = sprints.find(s => s.state === 'active')
              const sprint = activeSprint || sprints.find(s => s.state === 'closed') || null

              if (!sprint) return { boardId: board.id, data: null }

              const sprintIssuesData = await getSprintIssues(sprint.id, { signal })
              return { boardId: board.id, data: { sprint, summary: sprintIssuesData.summary } }
            } catch {
              return { boardId: board.id, data: null }
            }
          })
        )

        if (signal.aborted) return

        for (const { boardId, data } of results) {
          if (data) sprintData[boardId] = data
        }
        this.boardSprintData = { ...sprintData }
      }
    },

    handleSelectTeam(board) {
      this.selectedTeam = board
      this.currentView = 'team-detail'
      localStorage.setItem('selectedTeam', JSON.stringify({ id: board.id, name: board.name }))
    },

    async refreshData() {
      this.isRefreshing = true

      try {
        const result = await apiRefreshData('RHOAIENG')

        if (result.success) {
          await this.loadBoards()
          this.loadBoardSprints().catch(() => {})
          this.showToast(`Successfully refreshed data!`)
        }
      } catch (error) {
        console.error('Refresh error:', error)

        if (error.message.includes('Authentication')) {
          alert('Your session has expired. Please refresh the page and sign in again.')
        } else {
          alert(`Failed to refresh: ${error.message}`)
        }
      } finally {
        this.isRefreshing = false
      }
    },

    async handleSettingsSaved() {
      this.showToast('Board settings saved')
      this.currentView = 'dashboard'
      await this.loadBoards()
      this.loadBoardSprints().catch(() => {})
    },

    async handleSignOut() {
      this.showUserMenu = false
      await this.signOut()
    },

    handleClickOutside(event) {
      const userMenu = event.target.closest('.relative')
      if (!userMenu) {
        this.showUserMenu = false
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
