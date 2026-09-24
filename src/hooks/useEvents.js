import { useLocalStorageState } from './useLocalStorageState'
import { useToast } from '../components/shared/Toast'

export const EVENTS_POSTS_KEY = 'vvEventsPosts'
export const EVENTS_AVAILABILITY_KEY = 'vvEventsAvailability'
const STORAGE_FULL_MESSAGE = 'Could not save to local storage (storage may be full).'

export function useEventPosts() {
  const showToast = useToast()
  return useLocalStorageState(EVENTS_POSTS_KEY, [], () => showToast(STORAGE_FULL_MESSAGE))
}

export function useEventAvailability() {
  const showToast = useToast()
  return useLocalStorageState(EVENTS_AVAILABILITY_KEY, {}, () => showToast(STORAGE_FULL_MESSAGE))
}
