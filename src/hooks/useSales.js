import { useLocalStorageState } from './useLocalStorageState'

export const SALES_KEY = 'vvSales'

export function useSales() {
  return useLocalStorageState(SALES_KEY, [])
}
