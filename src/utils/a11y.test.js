import { describe, expect, it, vi } from 'vitest'
import { onActivate } from './a11y'

const key = (k, same = true) => {
  const target = {}
  return { key: k, target, currentTarget: same ? target : {}, preventDefault: vi.fn() }
}

describe('onActivate (keyboard support for clickable rows)', () => {
  it('runs the action on Enter and Space', () => {
    const action = vi.fn()
    const handler = onActivate(action)
    handler(key('Enter'))
    handler(key(' '))
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys', () => {
    const action = vi.fn()
    onActivate(action)(key('a'))
    expect(action).not.toHaveBeenCalled()
  })

  it('leaves keys pressed inside a button or link in the row alone', () => {
    const action = vi.fn()
    const e = key('Enter', false)
    onActivate(action)(e)
    expect(action).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
