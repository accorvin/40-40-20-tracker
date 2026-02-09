/**
 * Tests for LoadingOverlay.vue component - following TDD practices.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingOverlay from '../components/LoadingOverlay.vue'

describe('LoadingOverlay', () => {
  it('renders with default loading message', () => {
    const wrapper = mount(LoadingOverlay)

    expect(wrapper.text()).toContain('Loading...')
  })

  it('renders with custom message', () => {
    const wrapper = mount(LoadingOverlay, {
      props: { message: 'Refreshing data...' }
    })

    expect(wrapper.text()).toContain('Refreshing data...')
  })

  it('has data-testid for testing', () => {
    const wrapper = mount(LoadingOverlay)

    expect(wrapper.find('[data-testid="loading-overlay"]').exists()).toBe(true)
  })

  it('renders spinner animation', () => {
    const wrapper = mount(LoadingOverlay)

    const spinner = wrapper.find('.animate-spin')
    expect(spinner.exists()).toBe(true)
  })

  it('uses fixed positioning for overlay', () => {
    const wrapper = mount(LoadingOverlay)

    const overlay = wrapper.find('[data-testid="loading-overlay"]')
    expect(overlay.classes()).toContain('fixed')
    expect(overlay.classes()).toContain('inset-0')
  })
})
