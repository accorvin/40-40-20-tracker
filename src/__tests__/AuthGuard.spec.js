/**
 * Tests for AuthGuard.vue component - following TDD practices.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import AuthGuard from '../components/AuthGuard.vue'

const mockSignIn = vi.fn()
let mockUser = ref(null)
let mockLoading = ref(true)
let mockError = ref(null)

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockLoading,
    error: mockError,
    signIn: mockSignIn
  })
}))

describe('AuthGuard', () => {
  beforeEach(() => {
    mockUser.value = null
    mockLoading.value = true
    mockError.value = null
    mockSignIn.mockReset()
  })

  it('shows loading spinner when loading', () => {
    mockLoading.value = true

    const wrapper = mount(AuthGuard)

    expect(wrapper.text()).toContain('Authenticating...')
  })

  it('shows error message and try again button when error', async () => {
    mockLoading.value = false
    mockError.value = 'Access denied. Only @redhat.com email addresses are allowed.'

    const wrapper = mount(AuthGuard)

    expect(wrapper.text()).toContain('Authentication Error')
    expect(wrapper.text()).toContain('Access denied')

    const button = wrapper.find('button')
    expect(button.text()).toBe('Try Again')

    await button.trigger('click')
    expect(mockSignIn).toHaveBeenCalled()
  })

  it('shows sign-in screen when unauthenticated', () => {
    mockLoading.value = false
    mockUser.value = null

    const wrapper = mount(AuthGuard)

    expect(wrapper.text()).toContain('40-40-20 Sprint Allocation Tracker')
    expect(wrapper.text()).toContain('Sign in with your @redhat.com account')
    expect(wrapper.text()).toContain('Sign in with Google')
  })

  it('calls signIn when sign-in button is clicked', async () => {
    mockLoading.value = false
    mockUser.value = null

    const wrapper = mount(AuthGuard)

    const buttons = wrapper.findAll('button')
    const signInButton = buttons.find(b => b.text().includes('Sign in with Google'))
    await signInButton.trigger('click')

    expect(mockSignIn).toHaveBeenCalled()
  })

  it('renders slot content when authenticated', () => {
    mockLoading.value = false
    mockUser.value = { email: 'test@redhat.com', displayName: 'Test User' }

    const wrapper = mount(AuthGuard, {
      slots: {
        default: '<div data-testid="app-content">App Content</div>'
      }
    })

    expect(wrapper.find('[data-testid="app-content"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('App Content')
  })

  it('does not render slot content when loading', () => {
    mockLoading.value = true

    const wrapper = mount(AuthGuard, {
      slots: {
        default: '<div data-testid="app-content">App Content</div>'
      }
    })

    expect(wrapper.find('[data-testid="app-content"]').exists()).toBe(false)
  })

  it('shows Red Hat logo on sign-in screen', () => {
    mockLoading.value = false
    mockUser.value = null

    const wrapper = mount(AuthGuard)

    const logo = wrapper.find('img')
    expect(logo.exists()).toBe(true)
    expect(logo.attributes('src')).toContain('redhat-logo.svg')
  })
})
