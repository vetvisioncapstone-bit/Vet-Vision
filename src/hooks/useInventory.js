import { useLocalStorageState } from './useLocalStorageState'

export const INVENTORY_KEY = 'vvInventoryProducts'

export function useInventory() {
  return useLocalStorageState(INVENTORY_KEY, [])
}
