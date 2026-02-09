/**
 * Tests for Toast.vue component - following TDD practices.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Toast from '../components/Toast.vue'

describe('Toast', () => {
  it('renders message text', async () => {
    const wrapper = mount(Toast, {
      props: { message: 'Data refreshed successfully!' }
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Data refreshed successfully!')
  })

  it('renders success icon by default', async () => {
    const wrapper = mount(Toast, {
      props: { message: 'Success!' }
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.text-green-500').exists()).toBe(true)
  })

  it('renders error icon for error type', async () => {
    const wrapper = mount(Toast, {
      props: { message: 'Failed!', type: 'error' }
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.text-red-500').exists()).toBe(true)
  })

  it('renders warning icon for warning type', async () => {
    const wrapper = mount(Toast, {
      props: { message: 'Warning!', type: 'warning' }
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.text-yellow-500').exists()).toBe(true)
  })

  it('applies correct border color for each type', async () => {
    const successWrapper = mount(Toast, {
      props: { message: 'msg', type: 'success' }
    })
    await successWrapper.vm.$nextTick()
    expect(successWrapper.find('.border-green-500').exists()).toBe(true)

    const errorWrapper = mount(Toast, {
      props: { message: 'msg', type: 'error' }
    })
    await errorWrapper.vm.$nextTick()
    expect(errorWrapper.find('.border-red-500').exists()).toBe(true)
  })

  it('emits close event when close button is clicked', async () => {
    vi.useFakeTimers()

    const wrapper = mount(Toast, {
      props: { message: 'msg', duration: 0 }
    })
    await wrapper.vm.$nextTick()

    const closeButton = wrapper.find('button')
    await closeButton.trigger('click')

    vi.advanceTimersByTime(300)

    expect(wrapper.emitted('close')).toBeTruthy()

    vi.useRealTimers()
  })

  it('auto-dismisses after duration', async () => {
    vi.useFakeTimers()

    const wrapper = mount(Toast, {
      props: { message: 'msg', duration: 3000 }
    })

    vi.advanceTimersByTime(3000)
    vi.advanceTimersByTime(300)

    expect(wrapper.emitted('close')).toBeTruthy()

    vi.useRealTimers()
  })
})
