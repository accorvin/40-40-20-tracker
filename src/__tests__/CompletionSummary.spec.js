/**
 * Tests for CompletionSummary.vue component - following TDD practices.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompletionSummary from '../components/CompletionSummary.vue'

describe('CompletionSummary', () => {
  const mockSummary = {
    totalPoints: 50,
    completedPoints: 35,
    buckets: {
      'bugs-tech-debt': { points: 20, completedPoints: 15 },
      'feature-work': { points: 25, completedPoints: 20 },
      'learning': { points: 5, completedPoints: 0 }
    }
  }

  it('renders nothing when sprintState is not closed', () => {
    const wrapper = mount(CompletionSummary, {
      props: { summary: mockSummary, sprintState: 'active' }
    })

    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('renders nothing when sprintState is future', () => {
    const wrapper = mount(CompletionSummary, {
      props: { summary: mockSummary, sprintState: 'future' }
    })

    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('renders completion stats when sprintState is closed', () => {
    const wrapper = mount(CompletionSummary, {
      props: { summary: mockSummary, sprintState: 'closed' }
    })

    expect(wrapper.text()).toContain('Sprint Completion')
    expect(wrapper.text()).toContain('35')
    expect(wrapper.text()).toContain('50')
    expect(wrapper.text()).toContain('70%')
  })

  it('renders a green completion bar', () => {
    const wrapper = mount(CompletionSummary, {
      props: { summary: mockSummary, sprintState: 'closed' }
    })

    const bar = wrapper.find('[data-testid="completion-bar"]')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('style')).toContain('width: 70%')
  })

  it('shows per-bucket breakdown', () => {
    const wrapper = mount(CompletionSummary, {
      props: { summary: mockSummary, sprintState: 'closed' }
    })

    expect(wrapper.text()).toContain('Bugs & Tech Debt')
    expect(wrapper.text()).toContain('15/20')
    expect(wrapper.text()).toContain('Feature Work')
    expect(wrapper.text()).toContain('20/25')
  })

  it('skips buckets with 0 total points', () => {
    const summaryWithZero = {
      totalPoints: 45,
      completedPoints: 35,
      buckets: {
        'bugs-tech-debt': { points: 20, completedPoints: 15 },
        'feature-work': { points: 25, completedPoints: 20 },
        'learning': { points: 0, completedPoints: 0 }
      }
    }

    const wrapper = mount(CompletionSummary, {
      props: { summary: summaryWithZero, sprintState: 'closed' }
    })

    expect(wrapper.text()).not.toContain('Learning')
  })

  it('handles 100% completion', () => {
    const fullSummary = {
      totalPoints: 30,
      completedPoints: 30,
      buckets: {
        'bugs-tech-debt': { points: 15, completedPoints: 15 },
        'feature-work': { points: 15, completedPoints: 15 },
        'learning': { points: 0, completedPoints: 0 }
      }
    }

    const wrapper = mount(CompletionSummary, {
      props: { summary: fullSummary, sprintState: 'closed' }
    })

    expect(wrapper.text()).toContain('100%')
  })
})
