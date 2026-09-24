import { useLocalStorageState } from './useLocalStorageState'
import { STAFF_ACCOUNTS_KEY } from '../utils/auth'

export function useStaffAccounts() {
  return useLocalStorageState(STAFF_ACCOUNTS_KEY, [])
}
