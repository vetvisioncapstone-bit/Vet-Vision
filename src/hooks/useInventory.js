import { useLocalStorageState } from './useLocalStorageState'
import { useToast } from '../components/shared/Toast'

export const INVENTORY_KEY = 'vvInventoryProducts'
const STORAGE_FULL_MESSAGE = 'Could not save to local storage (storage may be full).'

export function useInventory() {
  const showToast = useToast()
  return useLocalStorageState(INVENTORY_KEY, [], () => showToast(STORAGE_FULL_MESSAGE))
}
