import { useLocalStorageState } from './useLocalStorageState'
import { useToast } from '../components/shared/Toast'
import { STAFF_ACCOUNTS_KEY } from '../utils/auth'

const STORAGE_FULL_MESSAGE = 'Could not save to local storage (storage may be full).'

export function useStaffAccounts() {
  const showToast = useToast()
  return useLocalStorageState(STAFF_ACCOUNTS_KEY, [], () => showToast(STORAGE_FULL_MESSAGE))
}
