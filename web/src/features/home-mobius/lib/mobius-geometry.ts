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
export interface Point3 {
  x: number
  y: number
  z: number
}

export interface ProjectedPoint extends Point3 {
  perspective: number
}

export function mobiusPoint(u: number, v: number): Point3 {
  const radius = 240 + v * Math.cos(u / 2)
  return {
    x: radius * Math.cos(u),
    y: radius * Math.sin(u),
    z: v * Math.sin(u / 2),
  }
}

export function mobiusTangent(u: number, v: number): Point3 {
  const radius = 240 + v * Math.cos(u / 2)
  const radialChange = (-v * Math.sin(u / 2)) / 2
  return {
    x: radialChange * Math.cos(u) - radius * Math.sin(u),
    y: radialChange * Math.sin(u) + radius * Math.cos(u),
    z: (v * Math.cos(u / 2)) / 2,
  }
}

/** Downward outflow bends into the ribbon's tangent, without crossing its width. */
export function waterfallPoint(
  progress: number,
  outlet: Point3,
  entry: Point3,
  tangent: Point3
): Point3 {
  const p = progress
  const q = 1 - p
  const tangentScale = 240 / Math.hypot(tangent.x, tangent.y, tangent.z)
  return {
    x:
      q ** 3 * outlet.x +
      3 * q * q * p * outlet.x +
      3 * q * p * p * (entry.x - tangent.x * tangentScale) +
      p ** 3 * entry.x,
    y:
      q ** 3 * outlet.y +
      3 * q * q * p * (outlet.y + 320) +
      3 * q * p * p * (entry.y - tangent.y * tangentScale) +
      p ** 3 * entry.y,
    z:
      q ** 3 * outlet.z +
      3 * q * q * p * outlet.z +
      3 * q * p * p * (entry.z - tangent.z * tangentScale) +
      p ** 3 * entry.z,
  }
}

export function fitScene(width: number, height: number, sceneWidth = 1200) {
  const scale = Math.min(width / sceneWidth, height / 650)
  return {
    scale,
    x: (width - sceneWidth * scale) / 2,
    y: (height - 650 * scale) / 2,
  }
}
