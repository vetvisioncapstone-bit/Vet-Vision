import { useLocalStorageState } from './useLocalStorageState'
import { useToast } from '../components/shared/Toast'

export const SALES_KEY = 'vvSales'
const STORAGE_FULL_MESSAGE = 'Could not save to local storage (storage may be full).'

export function useSales() {
  const showToast = useToast()
  return useLocalStorageState(SALES_KEY, [], () => showToast(STORAGE_FULL_MESSAGE))
}
