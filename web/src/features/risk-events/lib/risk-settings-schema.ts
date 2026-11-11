/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { z } from 'zod'

const RISK_MIN_DURATION = 60
const RISK_MAX_DURATION = 30 * 86400
const RISK_DURATION_SLOTS = 3
export const RISK_LEVEL_COUNT = 4

const durationSeconds = z
  .number()
  .int()
  .min(RISK_MIN_DURATION)
  .max(RISK_MAX_DURATION)

export const riskSettingsSchema = z.object({
  hitThreshold: z.number().int().min(1).max(100),
  firstWindowSeconds: durationSeconds,
  escalationWindowSeconds: durationSeconds,
  resetAfterSeconds: durationSeconds,
  levelDurationsSeconds: z
    .array(durationSeconds)
    .length(RISK_DURATION_SLOTS)
    .refine(
      (durations) =>
        durations.every(
          (value, index) => index === 0 || value > durations[index - 1]
        ),
      { message: 'increasing' }
    ),
  notifyLevels: z.array(z.number().int().min(1).max(RISK_LEVEL_COUNT)),
})

export type RiskSettingsValues = z.infer<typeof riskSettingsSchema>

export const RISK_SETTINGS_DEFAULTS: RiskSettingsValues = {
  hitThreshold: 3,
  firstWindowSeconds: 3600,
  escalationWindowSeconds: 86400,
  resetAfterSeconds: 86400,
  levelDurationsSeconds: [600, 3600, 86400],
  notifyLevels: [3, 4],
}
