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
import type { Point3 } from './mobius-geometry'

export interface RibbonPose {
  stretch: number
  lobe: number
  waist: number
  lift: number
  bow: number
  halfWidth: number
  twist: number
  twistBias: number
  yaw: number
  pitch: number
  roll: number
  centerX: number
  centerY: number
  width: number
  height: number
}

const poses: { at: number; value: RibbonPose }[] = [
  {
    at: 0,
    value: {
      stretch: 1.35,
      lobe: 0.03,
      waist: 0.02,
      lift: 34,
      bow: 0,
      halfWidth: 76,
      twist: 0.35,
      twistBias: 0.56,
      yaw: -0.22,
      pitch: 0.62,
      roll: -0.12,
      centerX: 0.5,
      centerY: 0.44,
      width: 0.9,
      height: 0.87,
    },
  },
  {
    at: 0.45,
    value: {
      stretch: 1.5,
      lobe: 0.11,
      waist: -0.06,
      lift: 48,
      bow: 12,
      halfWidth: 76,
      twist: 0.72,
      twistBias: 0.7,
      yaw: 0.25,
      pitch: 0.62,
      roll: -0.28,
      centerX: 0.4,
      centerY: 0.57,
      width: 0.85,
      height: 0.85,
    },
  },
  {
    at: 1,
    value: {
      stretch: 1.3,
      lobe: 0.1,
      waist: -0.03,
      lift: 68,
      bow: 20,
      halfWidth: 72,
      twist: 1.12,
      twistBias: 0.35,
      yaw: 0.48,
      pitch: 0.62,
      roll: -0.72,
      centerX: 0.29,
      centerY: 0.51,
      width: 0.61,
      height: 0.86,
    },
  },
  {
    at: 1.6,
    value: {
      stretch: 1.22,
      lobe: 0.08,
      waist: 0.04,
      lift: 72,
      bow: -18,
      halfWidth: 64,
      twist: 1.55,
      twistBias: 0.5,
      yaw: 0.65,
      pitch: 0.78,
      roll: 0.38,
      centerX: 0.64,
      centerY: 0.53,
      width: 0.5,
      height: 0.82,
    },
  },
  {
    at: 2.2,
    value: {
      stretch: 1.5,
      lobe: 0.08,
      waist: 0.04,
      lift: 74,
      bow: -20,
      halfWidth: 72,
      twist: 1.9,
      twistBias: 0.25,
      yaw: -0.25,
      pitch: 0.55,
      roll: 0.94,
      centerX: 0.74,
      centerY: 0.5,
      width: 0.46,
      height: 0.86,
    },
  },
  {
    at: 3,
    value: {
      stretch: 1.4,
      lobe: 0.07,
      waist: -0.02,
      lift: 52,
      bow: 8,
      halfWidth: 76,
      twist: 2.4,
      twistBias: 0.62,
      yaw: -0.38,
      pitch: 0.66,
      roll: -0.12,
      centerX: 0.73,
      centerY: 0.53,
      width: 0.48,
      height: 0.78,
    },
  },
]

/** The shared presentation clock determines the sculpture's form and its composition. */
export function ribbonPose(progress: number): RibbonPose {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(3, progress)) : 0
  let next = 1
  while (next < poses.length - 1 && p > poses[next].at) next++
  const from = poses[next - 1]
  const to = poses[next]
  const t = (p - from.at) / (to.at - from.at)
  const blend = t * t * (3 - 2 * t)
  const pose = { ...from.value }
  for (const key of Object.keys(pose) as (keyof RibbonPose)[]) {
    pose[key] += (to.value[key] - pose[key]) * blend
  }
  return pose
}

/** A closed, deformable centerline carrying a single half-twisted strip.
 * Its frame is periodic; its width direction reverses after 2π.
 * Therefore P(u + 2π, v) = P(u, -v), including every intermediate morph.
 */
export function ribbonPoint(u: number, v: number, pose: RibbonPose): Point3 {
  const radius =
    240 *
    (1 + pose.lobe * Math.cos(3 * u - 0.35) + pose.waist * Math.cos(2 * u))
  const dr =
    240 *
    (-3 * pose.lobe * Math.sin(3 * u - 0.35) - 2 * pose.waist * Math.sin(2 * u))
  const c = Math.cos(u)
  const s = Math.sin(u)
  const tx = (dr * c - radius * s) * pose.stretch
  const ty = dr * s + radius * c
  const tz = 2 * pose.lift * Math.cos(2 * u + 0.55) + pose.bow * c
  const planarLength = Math.hypot(tx, ty)
  const tangentLength = Math.hypot(tx, ty, tz)
  const rx = ty / planarLength
  const ry = -tx / planarLength
  const nx = (ry * tz) / tangentLength
  const ny = (-rx * tz) / tangentLength
  const nz = (rx * ty - ry * tx) / tangentLength
  const twist = u / 2 + pose.twist + pose.twistBias * Math.sin(u)
  const stripWidth = v * pose.halfWidth * (1 + 0.08 * Math.cos(3 * u))
  const radial = stripWidth * Math.cos(twist)
  const normal = stripWidth * Math.sin(twist)
  return {
    x: radius * c * pose.stretch + rx * radial + nx * normal,
    y: radius * s + ry * radial + ny * normal,
    z: pose.lift * Math.sin(2 * u + 0.55) + pose.bow * s + nz * normal,
  }
}

export function ribbonTangent(u: number, v: number, pose: RibbonPose): Point3 {
  const before = ribbonPoint(u - 0.0001, v, pose)
  const after = ribbonPoint(u + 0.0001, v, pose)
  return {
    x: (after.x - before.x) / 0.0002,
    y: (after.y - before.y) / 0.0002,
    z: (after.z - before.z) / 0.0002,
  }
}
