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
import { ribbonPoint, ribbonPose } from './ribbon-shape'

export const MORPH_DURATION = 24
export const MORPH_FPS = 60
export const MODEL_COLUMNS = 192
export const MODEL_KEYS = [0, 0.45, 1, 1.6, 2.2, 3] as const

/** The same two edge vertices define each cross-section in all six meshes. */
export function createMorphModels(): Float32Array[] {
  return MODEL_KEYS.map((key) => {
    const pose = ribbonPose(key)
    const vertices = new Float32Array((MODEL_COLUMNS + 1) * 6)
    const cy = Math.cos(pose.yaw),
      sy = Math.sin(pose.yaw)
    const cp = Math.cos(pose.pitch),
      sp = Math.sin(pose.pitch)
    const cr = Math.cos(pose.roll),
      sr = Math.sin(pose.roll)
    for (let column = 0; column <= MODEL_COLUMNS; column++) {
      for (let edge = 0; edge < 2; edge++) {
        const point = ribbonPoint(
          (column / MODEL_COLUMNS) * Math.PI * 2,
          edge * 2 - 1,
          pose
        )
        const x = point.x * cy + point.z * sy
        const depth = -point.x * sy + point.z * cy
        const y = point.y * cp - depth * sp
        const offset = column * 6 + edge * 3
        vertices[offset] = x * cr - y * sr
        vertices[offset + 1] = x * sr + y * cr
        vertices[offset + 2] = point.y * sp + depth * cp
      }
    }
    return vertices
  })
}

/** Periodic quintic Hermite interpolation matches position, velocity and acceleration at every key. */
export function morphWeights(seconds: number): number[] {
  const time = ((seconds % MORPH_DURATION) + MORPH_DURATION) % MORPH_DURATION
  const position = time / 4
  const key = Math.floor(position)
  const t = position - key
  const t2 = t * t
  const t3 = t2 * t
  const t4 = t3 * t
  const t5 = t4 * t
  const p0 = 1 - 10 * t3 + 15 * t4 - 6 * t5
  const p1 = 10 * t3 - 15 * t4 + 6 * t5
  const v0 = t - 6 * t3 + 8 * t4 - 3 * t5
  const v1 = -4 * t3 + 7 * t4 - 3 * t5
  const a0 = (t2 - 3 * t3 + 3 * t4 - t5) / 2
  const a1 = (t3 - 2 * t4 + t5) / 2
  const weights = Array<number>(6).fill(0)
  weights[(key + 5) % 6] = -v0 / 2 + a0
  weights[key] = p0 - v1 / 2 - 2 * a0 + a1
  weights[(key + 1) % 6] = p1 + v0 / 2 + a0 - 2 * a1
  weights[(key + 2) % 6] = v1 / 2 + a1
  return weights
}

export function interpolateMorphModel(
  models: Float32Array[],
  seconds: number,
  output: Float32Array
): void {
  const weights = morphWeights(seconds)
  output.fill(0)
  for (let key = 0; key < models.length; key++) {
    const weight = weights[key]
    if (weight === 0) continue
    for (let vertex = 0; vertex < output.length; vertex++) {
      output[vertex] += models[key][vertex] * weight
    }
  }
}

/** A 2π lap reverses the width coordinate; a 4π lap returns a byte to its original lane. */
export function pointOnMorphModel(
  vertices: Float32Array,
  u: number,
  v: number,
  output: Point3 = { x: 0, y: 0, z: 0 }
): Point3 {
  const lap = Math.floor(u / (Math.PI * 2))
  const wrapped = ((u % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const position = (wrapped / (Math.PI * 2)) * MODEL_COLUMNS
  const column = Math.floor(position)
  const along = position - column
  const across = (1 + (Math.abs(lap % 2) === 1 ? -v : v)) / 2
  const result = output
  const offset = column * 6
  const opposite = 1 - across
  const x = vertices[offset] * opposite + vertices[offset + 3] * across
  const y = vertices[offset + 1] * opposite + vertices[offset + 4] * across
  const z = vertices[offset + 2] * opposite + vertices[offset + 5] * across
  result.x =
    x +
    (vertices[offset + 6] * opposite + vertices[offset + 9] * across - x) *
      along
  result.y =
    y +
    (vertices[offset + 7] * opposite + vertices[offset + 10] * across - y) *
      along
  result.z =
    z +
    (vertices[offset + 8] * opposite + vertices[offset + 11] * across - z) *
      along
  return result
}

export function sampleMorphModel(
  models: Float32Array[],
  seconds: number,
  u: number,
  v: number
): Point3 {
  const weights = morphWeights(seconds)
  const result = { x: 0, y: 0, z: 0 }
  for (let key = 0; key < models.length; key++) {
    if (weights[key] === 0) continue
    const point = pointOnMorphModel(models[key], u, v)
    result.x += point.x * weights[key]
    result.y += point.y * weights[key]
    result.z += point.z * weights[key]
  }
  return result
}

/** Bake actual vertex coordinates, rather than optical-flow images, at 60 frames per second. */
export function bakeMorphFrames(models: Float32Array[]): Float32Array[] {
  return Array.from({ length: MORPH_DURATION * MORPH_FPS + 1 }, (_, frame) => {
    const vertices = new Float32Array(models[0].length)
    interpolateMorphModel(models, frame / MORPH_FPS, vertices)
    return vertices
  })
}
