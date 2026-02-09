/**
 * Tests for DashboardGrid.vue component - following TDD practices.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardGrid from '../components/DashboardGrid.vue'

describe('DashboardGrid', () => {
  const mockBoards = [
    { id: 1, name: 'Board Alpha', displayName: 'Team Alpha' },
    { id: 2, name: 'Board Beta', displayName: 'Team Beta' },
    { id: 3, name: 'Board Gamma', displayName: 'Team Gamma' }
  ]

  it('shows empty state when no boards', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: [] }
    })

    expect(wrapper.text()).toContain('No team boards found')
    expect(wrapper.text()).toContain('Click Refresh to fetch boards from Jira')
  })

  it('renders a card for each board', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards }
    })

    const cards = wrapper.findAll('.cursor-pointer')
    expect(cards).toHaveLength(3)
  })

  it('displays board display names', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards }
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
      props: { boards: boardsWithoutDisplayName }
    })

    expect(wrapper.text()).toContain('RHOAIENG Board - Team Alpha')
  })

  it('emits select-team event with board data when card is clicked', async () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards }
    })

    const cards = wrapper.findAll('.cursor-pointer')
    await cards[1].trigger('click')

    expect(wrapper.emitted('select-team')).toBeTruthy()
    expect(wrapper.emitted('select-team')[0]).toEqual([mockBoards[1]])
  })

  it('renders responsive grid layout', () => {
    const wrapper = mount(DashboardGrid, {
      props: { boards: mockBoards }
    })

    const grid = wrapper.find('.grid')
    expect(grid.exists()).toBe(true)
    expect(grid.classes()).toContain('grid-cols-1')
    expect(grid.classes()).toContain('md:grid-cols-2')
    expect(grid.classes()).toContain('lg:grid-cols-3')
  })
})
