import { useLocalStorageState } from './useLocalStorageState'

export const PATIENTS_KEY = 'vvPatients'

export function usePatients() {
  return useLocalStorageState(PATIENTS_KEY, [])
}
