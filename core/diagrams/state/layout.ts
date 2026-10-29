// The state module (plan C T40): a stub until its own task replaces this file and keeps the register line.
// It registers itself on import, as flowchart's does.
import { register } from '../../registry.ts'
import { stub } from '../stub.ts'

export const state = stub('state')

register(state)
