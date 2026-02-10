/**
 * Tests for DashboardGrid.vue component - following TDD practices.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardGrid from '../components/DashboardGrid.vue'
import TeamCard from '../components/TeamCard.vue'

describe('DashboardGrid', () => {
  const mockBoards = [
    { id: 1, name: 'Board Alpha', displayName: 'Team Alpha' },
    { id: 2, name: 'Board Beta', displayName: 'Team Beta' },
    { id: 3, name: 'Board Gamma', displayName: 'Team Gamma' }
  ]

  const mockBoardSprintData = {
    1: {
      sprint: { id: 100, name: 'Sprint 42', state: 'active', startDate: '2026-02-03T00:00:00.000Z', endDate: '2026-02-14T00:00:00.000Z' },
      summary: { totalPoints: 45, estimatedIssueCount: 10, unestimatedIssueCount: 3, buckets: { 'bugs-tech-debt': { points: 20, issueCount: 4, completedPoints: 10 }, 'feature-work': { points: 25, issueCount: 6, completedPoints: 10 }, 'learning': { points: 0, issueCount: 0, completedPoints: 0 } } }
    },
    2: {
      sprint: { id: 101, name: 'Sprint 42', state: 'active', startDate: '2026-02-03T00:00:00.000Z', endDate: '2026-02-14T00:00:00.000Z' },
      summary: { totalPoints: 30, estimatedIssueCount: 6, unestimatedIssueCount: 0, buckets: { 'bugs-tech-debt': { points: 10, issueCount: 2, completedPoints: 5 }, 'feature-work': { points: 20, issueCount: 4, completedPoints: 5 }, 'learning': { points: 0, issueCount: 0, completedPoints: 0 } } }
    }
  }

  it('shows empty state when no boards', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: [], boardSprintData: {} }
    })

    expect(wrapper.text()).toContain('No team boards found')
    expect(wrapper.text()).toContain('Click Refresh to fetch boards from Jira')
  })

  it('renders a TeamCard for each board', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards, boardSprintData: mockBoardSprintData }
    })

    const cards = wrapper.findAllComponents(TeamCard)
    expect(cards).toHaveLength(3)
  })

  it('displays board display names', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards, boardSprintData: {} }
    })

    expect(wrapper.text()).toContain('Team Alpha')
    expect(wrapper.text()).toContain('Team Beta')
    expect(wrapper.text()).toContain('Team Gamma')
  })

  it('falls back to board name when no displayName', () => {
    const boardsWithoutDisplayName = [
      { id: 1, name: 'RHOAIENG Board - Team Alpha' }
    ]

    const wrapper = mount(DashboardGrid, {
      props: { boards: boardsWithoutDisplayName, boardSprintData: {} }
    })

    expect(wrapper.text()).toContain('RHOAIENG Board - Team Alpha')
  })

  it('emits select-team event with board data when card is clicked', async () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards, boardSprintData: {} }
    })

    const cards = wrapper.findAllComponents(TeamCard)
    cards[1].vm.$emit('select-team', mockBoards[1])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('select-team')).toBeTruthy()
    expect(wrapper.emitted('select-team')[0]).toEqual([mockBoards[1]])
  })

  it('renders responsive grid layout', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards, boardSprintData: {} }
    })

    const grid = wrapper.find('.grid')
    expect(grid.exists()).toBe(true)
    expect(grid.classes()).toContain('grid-cols-1')
    expect(grid.classes()).toContain('md:grid-cols-2')
    expect(grid.classes()).toContain('lg:grid-cols-3')
  })

  it('passes correct sprintData to each card from boardSprintData prop', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards, boardSprintData: mockBoardSprintData }
    })

    const cards = wrapper.findAllComponents(TeamCard)

    // Board 1 has sprint data
    expect(cards[0].props('sprintData')).toEqual(mockBoardSprintData[1])

    // Board 2 has sprint data
    expect(cards[1].props('sprintData')).toEqual(mockBoardSprintData[2])

    // Board 3 has no sprint data — should be null
    expect(cards[2].props('sprintData')).toBeNull()
  })
})
