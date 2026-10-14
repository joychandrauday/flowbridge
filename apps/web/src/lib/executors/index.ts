import { StepExecutor } from './types'
import { assignExecutor } from './assign'
import { createTaskExecutor } from './createTask'
import { updateFieldExecutor } from './updateField'
import { sendEmailExecutor } from './sendEmail'
import { sendTelegramExecutor } from './sendTelegram'
import { httpRequestExecutor } from './httpRequest'
import { delayExecutor } from './delay'
import { sendSlackExecutor } from './sendSlack'
import { sendDiscordExecutor } from './sendDiscord'

export const executors: Record<string, StepExecutor> = {
  assign: assignExecutor,
  create_task: createTaskExecutor,
  update_field: updateFieldExecutor,
  send_email: sendEmailExecutor,
  send_telegram: sendTelegramExecutor,
  send_slack: sendSlackExecutor,
  send_discord: sendDiscordExecutor,
  http_request: httpRequestExecutor,
  delay: delayExecutor,
}

export function getExecutor(type: string): StepExecutor | undefined {
  return executors[type]
}

export * from './types'
export * from './assign'
export * from './createTask'
export * from './updateField'
export * from './sendEmail'
export * from './sendTelegram'
export * from './httpRequest'
export * from './delay'
export * from './sendSlack'
export * from './sendDiscord'