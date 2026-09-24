import { useLocalStorageState } from './useLocalStorageState'
import { ADMIN_PROFILE_KEY, DEFAULT_ADMIN_PROFILE } from '../utils/auth'

export function useAdminProfile() {
  return useLocalStorageState(ADMIN_PROFILE_KEY, DEFAULT_ADMIN_PROFILE)
}
