<template>
  <div class="container mx-auto px-6 py-6">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button
          @click="$emit('back')"
          class="text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
        >
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-900">Board Settings</h2>
      </div>

      <!-- Tab bar -->
      <div class="flex border-b border-gray-200 mb-6">
        <button
          data-testid="settings-tab"
          @click="activeTab = 'projects'"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'projects'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
        >
          Projects
        </button>
        <button
          data-testid="settings-tab"
          @click="activeTab = 'boards'"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'boards'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
        >
          Boards
        </button>
      </div>

      <!-- Projects tab -->
      <div v-if="activeTab === 'projects'" data-testid="projects-tab-content">
        <p class="text-sm text-gray-500 mb-4">
          Projects map to Jira project keys. Each project's scrum boards are discovered automatically.
          The pillar is used to group projects on the org dashboard.
        </p>

        <!-- Column headers -->
        <div v-if="localProjects.length > 0" class="flex items-center gap-3 px-3 pb-2 border-b border-gray-200">
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-28">Key</span>
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">Name</span>
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">Pillar</span>
          <span class="w-24"></span>
        </div>

        <div class="divide-y divide-gray-200">
          <div
            v-for="(project, index) in localProjects"
            :key="project.key"
            class="flex items-center justify-between py-3 px-3"
          >
            <!-- Edit mode -->
            <div v-if="editingIndex === index" data-testid="edit-project-form" class="flex items-center gap-3 flex-1">
              <span class="text-sm font-mono text-gray-500 w-28">{{ project.key }}</span>
              <label class="flex-1">
                <span class="sr-only">Name</span>
                <input
                  v-model="editName"
                  placeholder="Project name"
                  class="text-sm border border-gray-300 rounded-md px-2 py-1 w-full"
                />
              </label>
              <label class="flex-1">
                <span class="sr-only">Pillar</span>
                <input
                  v-model="editPillar"
                  placeholder="Pillar / group"
                  class="text-sm border border-gray-300 rounded-md px-2 py-1 w-full"
                />
              </label>
              <button
                data-testid="confirm-edit-project"
                @click="confirmEdit(index)"
                class="text-sm text-primary-600 hover:text-primary-800 font-medium"
              >
                OK
              </button>
              <button
                @click="cancelEdit"
                class="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancel
              </button>
            </div>

            <!-- Display mode -->
            <div v-else class="flex items-center gap-3 flex-1">
              <span class="text-sm font-mono text-gray-500 w-28">{{ project.key }}</span>
              <span class="font-medium text-gray-900 flex-1">{{ project.name }}</span>
              <span class="text-sm text-gray-500 flex-1">{{ project.pillar }}</span>
            </div>

            <div v-if="editingIndex !== index" class="flex items-center gap-2 w-24 justify-end">
              <button
                data-testid="edit-project-btn"
                @click="startEdit(index)"
                class="text-sm text-primary-600 hover:text-primary-800 font-medium"
              >
                Edit
              </button>
              <button
                data-testid="delete-project-btn"
                @click="deleteProject(index)"
                class="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <!-- Add project form -->
        <div v-if="showAddForm" data-testid="new-project-form" class="border-t border-gray-200 pt-3 px-3">
          <div class="flex items-end gap-3">
            <label class="w-28">
              <span class="block text-xs font-medium text-gray-600 mb-1">Jira Project Key</span>
              <input
                v-model="newKey"
                placeholder="e.g. RHOAIENG"
                class="text-sm border border-gray-300 rounded-md px-2 py-1 w-full font-mono"
              />
            </label>
            <label class="flex-1">
              <span class="block text-xs font-medium text-gray-600 mb-1">Display Name</span>
              <input
                v-model="newName"
                placeholder="e.g. OpenShift AI Engineering"
                class="text-sm border border-gray-300 rounded-md px-2 py-1 w-full"
              />
            </label>
            <label class="flex-1">
              <span class="block text-xs font-medium text-gray-600 mb-1">Pillar</span>
              <input
                v-model="newPillar"
                placeholder="e.g. OpenShift AI"
                class="text-sm border border-gray-300 rounded-md px-2 py-1 w-full"
              />
            </label>
            <button
              data-testid="confirm-add-project"
              @click="confirmAdd"
              class="text-sm text-primary-600 hover:text-primary-800 font-medium py-1"
            >
              Add
            </button>
            <button
              @click="showAddForm = false; newKey = ''; newName = ''; newPillar = ''"
              class="text-sm text-gray-500 hover:text-gray-700 font-medium py-1"
            >
              Cancel
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-1.5">
            The key must match an existing Jira project. Boards will be auto-discovered on save.
          </p>
        </div>

        <div class="flex items-center gap-3 mt-4">
          <button
            data-testid="add-project-btn"
            @click="showAddForm = true"
            class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 transition-colors"
          >
            Add Project
          </button>
          <button
            @click="handleSaveProjects"
            :disabled="isSaving"
            class="px-4 py-2 text-sm bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ isSaving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>

      <!-- Boards tab -->
      <div v-if="activeTab === 'boards'" data-testid="boards-tab-content">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <!-- Project selector when multi-project -->
            <select
              v-if="projects.length > 1"
              v-model="selectedProjectKey"
              class="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option v-for="project in projects" :key="project.key" :value="project.key">
                {{ project.name }}
              </option>
            </select>
            <button
              @click="handleDiscover"
              :disabled="isDiscovering"
              class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isDiscovering ? 'Discovering...' : 'Discover Boards' }}
            </button>
            <button
              @click="handleSave"
              :disabled="isSaving"
              class="px-4 py-2 text-sm bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isSaving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>

        <div v-if="teams.length === 0" class="text-center py-12 text-gray-500">
          <p class="text-lg">No boards found.</p>
          <p>Click "Discover Boards" to fetch the board list from Jira.</p>
        </div>

        <div v-else class="divide-y divide-gray-200">
          <div
            v-for="team in sortedTeams"
            :key="team.boardId"
            data-testid="team-row"
            :class="[
              'flex items-center justify-between py-3 px-3 rounded-md hover:bg-primary-50 even:bg-gray-50 transition-colors',
              team.stale ? 'opacity-60' : ''
            ]"
          >
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900">{{ team.displayName || team.boardName }}</span>
                <span class="ml-2 text-sm text-gray-500">ID: {{ team.boardId }}</span>
                <span
                  v-if="team.stale"
                  class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                >
                  Inactive
                </span>
              </div>
              <p v-if="team.stale" class="text-xs text-gray-400 mt-0.5">
                {{ team.lastSprintEndDate ? `Last sprint ended ${formatRelativeDate(team.lastSprintEndDate)}` : 'No sprints found' }}
              </p>
            </div>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">Calculate by:</span>
                <select
                  v-model="team.calculationMode"
                  @change="updateCalculationMode(team.boardId, team.calculationMode)"
                  class="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  data-testid="calculation-mode-select"
                >
                  <option value="points">Story Points</option>
                  <option value="counts">Issue Counts</option>
                </select>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  :checked="team.enabled"
                  @change="toggleTeam(team.boardId)"
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getTeams, saveTeams, saveProjects, discoverBoards } from '../services/api'

const props = defineProps({
  projects: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['back', 'saved'])

// Tab state
const activeTab = ref('projects')

// Projects tab state
const localProjects = ref([])
const originalProjectKeys = ref(new Set())
const showAddForm = ref(false)
const newKey = ref('')
const newName = ref('')
const newPillar = ref('')
const editingIndex = ref(-1)
const editName = ref('')
const editPillar = ref('')

// Boards tab state
const teams = ref([])
const isSaving = ref(false)
const isDiscovering = ref(false)
const selectedProjectKey = ref('')

// Initialize
onMounted(() => {
  localProjects.value = props.projects.map(p => ({ ...p }))
  originalProjectKeys.value = new Set(props.projects.map(p => p.key))
  selectedProjectKey.value = props.projects.length > 0 ? props.projects[0].key : 'RHOAIENG'
  loadTeams()
})

// Reload teams when project selection changes
watch(selectedProjectKey, () => {
  loadTeams()
})

const sortedTeams = computed(() => {
  return [...teams.value].sort((a, b) => {
    if (a.stale && !b.stale) return 1
    if (!a.stale && b.stale) return -1
    return 0
  })
})

function formatRelativeDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`
  }

  const diffYears = Math.floor(diffMonths / 12)
  return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`
}

// Projects tab methods
function startEdit(index) {
  editingIndex.value = index
  editName.value = localProjects.value[index].name
  editPillar.value = localProjects.value[index].pillar
}

function confirmEdit(index) {
  if (!editName.value.trim() || !editPillar.value.trim()) return
  localProjects.value[index].name = editName.value.trim()
  localProjects.value[index].pillar = editPillar.value.trim()
  editingIndex.value = -1
}

function cancelEdit() {
  editingIndex.value = -1
}

function confirmAdd() {
  if (!newKey.value.trim() || !newName.value.trim() || !newPillar.value.trim()) return
  localProjects.value.push({
    key: newKey.value.trim(),
    name: newName.value.trim(),
    pillar: newPillar.value.trim()
  })
  showAddForm.value = false
  newKey.value = ''
  newName.value = ''
  newPillar.value = ''
}

function deleteProject(index) {
  if (!window.confirm(`Delete project "${localProjects.value[index].name}"?`)) return
  localProjects.value.splice(index, 1)
}

async function handleSaveProjects() {
  isSaving.value = true
  try {
    await saveProjects({ orgName: 'AI Engineering', projects: localProjects.value })

    // Auto-discover boards for newly added projects
    const newProjects = localProjects.value.filter(p => !originalProjectKeys.value.has(p.key))
    for (const project of newProjects) {
      await discoverBoards(project.key)
    }

    // Update original keys
    originalProjectKeys.value = new Set(localProjects.value.map(p => p.key))

    emit('saved')
  } catch (error) {
    console.error('Failed to save projects:', error)
  } finally {
    isSaving.value = false
  }
}

// Boards tab methods
async function loadTeams() {
  try {
    const data = await getTeams()
    teams.value = (data.teams || []).map(t => ({
      ...t,
      calculationMode: t.calculationMode || 'points'
    }))
  } catch (error) {
    console.error('Failed to load teams:', error)
    teams.value = []
  }
}

function toggleTeam(boardId) {
  const team = teams.value.find(t => t.boardId === boardId)
  if (team) {
    team.enabled = !team.enabled
  }
}

function updateCalculationMode(boardId, mode) {
  const team = teams.value.find(t => t.boardId === boardId)
  if (team) {
    team.calculationMode = mode
  }
}

async function handleSave() {
  isSaving.value = true
  try {
    await saveTeams(teams.value)
    emit('saved')
  } catch (error) {
    console.error('Failed to save teams:', error)
  } finally {
    isSaving.value = false
  }
}

async function handleDiscover() {
  isDiscovering.value = true
  try {
    await discoverBoards(selectedProjectKey.value)
    await loadTeams()
  } catch (error) {
    console.error('Failed to discover boards:', error)
  } finally {
    isDiscovering.value = false
  }
}
</script>
