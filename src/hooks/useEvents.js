import { useLocalStorageState } from './useLocalStorageState'

export const EVENTS_POSTS_KEY = 'vvEventsPosts'
export const EVENTS_AVAILABILITY_KEY = 'vvEventsAvailability'

export function useEventPosts() {
  return useLocalStorageState(EVENTS_POSTS_KEY, [])
}

export function useEventAvailability() {
  return useLocalStorageState(EVENTS_AVAILABILITY_KEY, {})
}
