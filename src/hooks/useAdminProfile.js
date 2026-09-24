import { useLocalStorageState } from './useLocalStorageState'
import { useToast } from '../components/shared/Toast'
import { ADMIN_PROFILE_KEY, DEFAULT_ADMIN_PROFILE } from '../utils/auth'

const STORAGE_FULL_MESSAGE = 'Could not save to local storage (storage may be full).'

export function useAdminProfile() {
  const showToast = useToast()
  return useLocalStorageState(ADMIN_PROFILE_KEY, DEFAULT_ADMIN_PROFILE, () => showToast(STORAGE_FULL_MESSAGE))
}
