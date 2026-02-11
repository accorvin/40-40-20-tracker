/**
 * API Service
 * Handles communication with the Amplify backend
 * Automatically includes Firebase ID token in requests
 */

import { useAuth } from '../composables/useAuth'

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '/api'

/**
 * Get Firebase ID token for authentication
 */
async function getAuthToken() {
  const { getIdToken, loading } = useAuth()

  // Wait for auth initialization to complete
  if (loading.value) {
    await new Promise((resolve) => {
      const checkLoading = setInterval(() => {
        if (!loading.value) {
          clearInterval(checkLoading)
          resolve()
        }
      }, 50)

      // Timeout after 10 seconds to prevent infinite waiting
      setTimeout(() => {
        clearInterval(checkLoading)
        resolve()
      }, 10000)
    })
  }

  try {
    return await getIdToken()
  } catch (error) {
    console.error('Failed to get auth token:', error)
    throw new Error('Authentication required. Please sign in again.')
  }
}

/**
 * Refresh data from Jira (async — returns immediately, processes in background)
 * @param {string} projectKey - Jira project key (e.g., 'RHOAIENG')
 * @param {object} options
 * @param {boolean} options.hardRefresh - If true, re-fetches closed sprints too
 * @returns {Promise<{status: string}>}
 */
export async function refreshData(projectKey, { hardRefresh = false } = {}) {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ projectKey, hardRefresh })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Refresh data error:', error)

    if (error.message.includes('401')) {
      throw new Error('Authentication failed. Please sign in again.')
    }

    throw new Error(error.message || 'Failed to refresh data')
  }
}

/**
 * Get pre-computed dashboard summary
 * @returns {Promise<{lastUpdated: string, boards: object}>}
 */
export async function getDashboardSummary() {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/dashboard-summary`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.')
      }

      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Get dashboard summary error:', error)
    throw error
  }
}

/**
 * Get list of boards from S3
 * @returns {Promise<{boards: Array}>}
 */
export async function getBoards() {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/boards`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.')
      }

      if (response.status === 500 && errorData.error?.includes('not found')) {
        throw new Error('No board data found. Please refresh to fetch data from Jira.')
      }

      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Get boards error:', error)
    throw error
  }
}

/**
 * Get sprints for a specific board from S3
 * @param {number} boardId - Board ID
 * @returns {Promise<{sprints: Array}>}
 */
export async function getSprintsForBoard(boardId, { signal } = {}) {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/boards/${boardId}/sprints`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.')
      }

      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error(`Get sprints error for board ${boardId}:`, error)
    throw error
  }
}

/**
 * Get issues for a specific sprint from S3
 * @param {number} sprintId - Sprint ID
 * @returns {Promise<object>} Sprint data with issues and summary
 */
export async function getSprintIssues(sprintId, { signal } = {}) {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/sprints/${sprintId}/issues`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.')
      }

      if (response.status === 500 && errorData.error?.includes('not found')) {
        throw new Error('No data found for this sprint. Please refresh to fetch data from Jira.')
      }

      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error(`Get sprint issues error for sprint ${sprintId}:`, error)
    throw error
  }
}

/**
 * Get team configuration from S3
 * @returns {Promise<{teams: Array}>}
 */
export async function getTeams() {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/teams`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.')
      }

      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Get teams error:', error)
    throw error
  }
}

/**
 * Discover boards from Jira (saves boards.json + teams.json without processing sprints)
 * @param {string} projectKey - Jira project key (e.g., 'RHOAIENG')
 * @returns {Promise<{success: boolean, boardCount: number, staleCount: number}>}
 */
export async function discoverBoards(projectKey) {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/discover-boards`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ projectKey })
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.')
      }

      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Discover boards error:', error)
    throw error
  }
}

/**
 * Save team configuration to S3
 * @param {Array} teams - Array of team config objects
 * @returns {Promise<{success: boolean}>}
 */
export async function saveTeams(teams) {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${API_ENDPOINT}/teams`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ teams })
    })

    if (!response.ok) {
      const errorData = await response.json()

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.')
      }

      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Save teams error:', error)
    throw error
  }
}
