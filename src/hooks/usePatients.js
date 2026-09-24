import { useLocalStorageState } from './useLocalStorageState'
import { useToast } from '../components/shared/Toast'

export const PATIENTS_KEY = 'vvPatients'
const STORAGE_FULL_MESSAGE = 'Could not save to local storage (storage may be full).'

export function usePatients() {
  const showToast = useToast()
  return useLocalStorageState(PATIENTS_KEY, [], () => showToast(STORAGE_FULL_MESSAGE))
}
