import { describe, expect, it } from 'vitest'
import { weightBand, weightProblem } from './AvailedItemsPicker'

describe('service weight ranges', () => {
  it('reads the range from the service name', () => {
    expect(weightBand('DOG CASTRATION UPTO 5KG SURG')).toEqual({ above: null, upTo: 5 })
    expect(weightBand('DOG OVH 6 TO 10KG SURG')).toEqual({ above: 5, upTo: 10 })
    expect(weightBand('CAT OVH 5KG ABOVE SURG')).toEqual({ above: 5, upTo: null })
    expect(weightBand('400 PF')).toBeNull()
  })

  it('flags a pet outside the range, and stays quiet without a weight', () => {
    expect(weightProblem('DOG CASTRATION UPTO 5KG SURG', '7 kg')).toMatch(/up to 5 kg/)
    expect(weightProblem('DOG OVH 6 TO 10KG SURG', '5.5 kg')).toBeNull() // 5.5 belongs to the 6-10 band
    expect(weightProblem('DOG OVH 6 TO 10KG SURG', '4 kg')).toMatch(/over 5 kg/)
    expect(weightProblem('DOG CASTRATION UPTO 5KG SURG', '')).toBeNull()
  })
})
