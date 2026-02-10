/**
 * Tests for AllocationBar.vue component - following TDD practices.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AllocationBar from '../components/AllocationBar.vue'

describe('AllocationBar', () => {
  const mockBuckets = {
    'bugs-tech-debt': {
      points: 40,
      count: 5
    },
    'feature-work': {
      points: 50,
      count: 8
    },
    'learning': {
      points: 0,
      count: 0
    }
  }

  it('renders segments with correct widths proportional to points', () => {
    const wrapper = mount(AllocationBar, {
      props: { buckets: mockBuckets, totalPoints: 90 }
    })

    // bugs-tech-debt: 40/90 ≈ 44%
    const bugsSegment = wrapper.find('[data-testid="segment-bugs-tech-debt"]')
    expect(bugsSegment.exists()).toBe(true)
    expect(bugsSegment.attributes('style')).toContain('width: 44%')

    // feature-work: 50/90 ≈ 56%
    const featureSegment = wrapper.find('[data-testid="segment-feature-work"]')
    expect(featureSegment.exists()).toBe(true)
    expect(featureSegment.attributes('style')).toContain('width: 56%')
  })

  it('shows percentage labels on segments >= 10%', () => {
    const wrapper = mount(AllocationBar, {
      props: { buckets: mockBuckets, totalPoints: 90 }
    })

    // Both segments are > 10% so labels should appear
    expect(wrapper.text()).toContain('44%')
    expect(wrapper.text()).toContain('56%')
  })

  it('hides percentage labels on segments < 10%', () => {
    const smallBuckets = {
      'bugs-tech-debt': { points: 5, count: 1 },
      'feature-work': { points: 90, count: 10 },
      'learning': { points: 5, count: 1 }
    }

    const wrapper = mount(AllocationBar, {
      props: { buckets: smallBuckets, totalPoints: 100 }
    })

    // 5% segments should not show labels
    const bugsSegment = wrapper.find('[data-testid="segment-bugs-tech-debt"]')
    expect(bugsSegment.text()).toBe('')
  })

  it('handles 0 total points gracefully', () => {
    const zeroBuckets = {
      'bugs-tech-debt': { points: 0, count: 0 },
      'feature-work': { points: 0, count: 0 },
      'learning': { points: 0, count: 0 }
    }

    const wrapper = mount(AllocationBar, {
      props: { buckets: zeroBuckets, totalPoints: 0 }
    })

    expect(wrapper.find('[data-testid="no-data"]').exists()).toBe(true)
  })

  it('renders target marker lines', () => {
    const wrapper = mount(AllocationBar, {
      props: { buckets: mockBuckets, totalPoints: 90 }
    })

    const markers = wrapper.findAll('[data-testid="target-marker"]')
    expect(markers.length).toBe(2) // 40% and 80% markers
  })

  it('shows tooltip on hover with bucket name, points, and percentage', () => {
    const wrapper = mount(AllocationBar, {
      props: { buckets: mockBuckets, totalPoints: 90 }
    })

    const bugsSegment = wrapper.find('[data-testid="segment-bugs-tech-debt"]')
    expect(bugsSegment.attributes('title')).toBe('Bugs & Tech Debt: 40 pts (44%)')

    const featureSegment = wrapper.find('[data-testid="segment-feature-work"]')
    expect(featureSegment.attributes('title')).toBe('Feature Work: 50 pts (56%)')
  })

  it('shows tooltip for learning segment when present', () => {
    const withLearning = {
      'bugs-tech-debt': { points: 40, count: 5 },
      'feature-work': { points: 40, count: 5 },
      'learning': { points: 20, count: 3 }
    }

    const wrapper = mount(AllocationBar, {
      props: { buckets: withLearning, totalPoints: 100 }
    })

    const learningSegment = wrapper.find('[data-testid="segment-learning"]')
    expect(learningSegment.attributes('title')).toBe('Learning: 20 pts (20%)')
  })
})
