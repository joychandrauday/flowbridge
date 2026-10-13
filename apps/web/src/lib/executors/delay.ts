import { StepExecutor, StepResult } from './types'

export const delayExecutor: StepExecutor = {
  type: 'delay',
  async execute(config): Promise<StepResult> {
    const { minutes } = config as { minutes: number }
    const runAfter = new Date(Date.now() + minutes * 60 * 1000)
    return { success: true, output: { delayed: true, minutes }, runAfter }
  },
}