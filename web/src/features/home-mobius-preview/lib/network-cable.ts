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
import type { Point3, ProjectedPoint } from './mobius-geometry'

type Project = (point: Point3) => ProjectedPoint

// A slightly tipped cable exposes its cut face to the camera.
export function cablePoint(x: number, y: number, z: number): Point3 {
  return {
    x: x - 35 + y * 0.035,
    y: -940 + y * 0.97 - z * 0.24,
    z: 30 + y * 0.12 + z * 0.97,
  }
}

export function conductorPoint(
  wire: number,
  progress: number,
  unfold = 1
): Point3 {
  const pair = Math.floor(wire / 2)
  const phase = progress * Math.PI * 6 + (wire % 2) * Math.PI + pair * 0.8
  const spread = 9 + progress * (5 + unfold * 18)
  return cablePoint(
    (pair - 1.5) * spread + Math.cos(phase) * 5.8,
    progress * (166 + pair * 8),
    Math.sin(phase) * 5.8 + (pair % 2) * 11
  )
}

export function cableOutlet(wire: number, unfold = 1): Point3 {
  const tip = conductorPoint(wire, 1, unfold)
  return { x: tip.x, y: tip.y + 21, z: tip.z + 2.5 }
}

/** Layered jacket, cut insulation, foil, braided shield, four twisted pairs and copper. */
export function drawNetworkCable(
  ctx: CanvasRenderingContext2D,
  project: Project
) {
  const sides = 36
  const strips = Array.from({ length: sides }, (_, side) => ({
    angle: (side / sides) * Math.PI * 2,
    depth: Math.sin(((side + 0.5) / sides) * Math.PI * 2),
  })).sort((a, b) => a.depth - b.depth)
  for (const strip of strips) {
    const angle2 = strip.angle + (Math.PI * 2) / sides
    const light = Math.max(0, Math.cos(strip.angle + 0.85))
    const shade = Math.round(15 + light ** 3 * 55)
    ctx.fillStyle = `rgb(${shade}, ${shade + 5}, ${shade + 4})`
    ctx.beginPath()
    for (let end = 0; end < 2; end++) {
      const angle = end === 0 ? strip.angle : angle2
      for (let i = 0; i <= 12; i++) {
        const y = end === 0 ? -700 + (i * 700) / 12 : (-i * 700) / 12
        const radius = 36 + Math.sin(y * 0.003) * 1.6
        const point = project(
          cablePoint(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
        )
        if (end === 0 && i === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
      }
    }
    ctx.closePath()
    ctx.fill()
  }

  // Fine extrusion ridges, visible only in the opening close-up.
  ctx.lineWidth = 0.35
  for (let ridge = 0; ridge < 45; ridge++) {
    const angle = (ridge / 45) * Math.PI
    const a = project(
      cablePoint(Math.cos(angle) * 36.3, -690, Math.sin(angle) * 36.3)
    )
    const b = project(
      cablePoint(Math.cos(angle) * 36.3, -3, Math.sin(angle) * 36.3)
    )
    ctx.strokeStyle = ridge % 4 === 0 ? '#ffffff15' : '#00000030'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  // Concentric cut face: jacket wall, silver shield and dark inner insulation.
  for (const [radius, fill] of [
    [36, '#8b9693'],
    [33.5, '#202825'],
    [30.5, '#b9c5bc'],
    [28.8, '#141e19'],
  ] as const) {
    ctx.fillStyle = fill
    ctx.beginPath()
    for (let step = 0; step <= 48; step++) {
      const angle = (step / 48) * Math.PI * 2
      const point = project(
        cablePoint(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      )
      if (step === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    }
    ctx.fill()
  }

  // Peeled foil tabs and cross-woven metallic shield reveal the inner assembly.
  for (const side of [-1, 1]) {
    const foil = [
      [side * 28, 0, 4],
      [side * 40, 26, 8],
      [side * 47, 59, 2],
      [side * 21, 35, 6],
    ]
    ctx.beginPath()
    for (let i = 0; i < foil.length; i++) {
      const point = project(cablePoint(foil[i][0], foil[i][1], foil[i][2]))
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    }
    ctx.closePath()
    ctx.fillStyle = side < 0 ? '#7e9390' : '#344944'
    ctx.fill()
  }
  ctx.lineWidth = 0.65
  for (let thread = 0; thread < 30; thread++) {
    for (const direction of [-1, 1]) {
      ctx.beginPath()
      let depth = 0
      for (let step = 0; step <= 14; step++) {
        const y = step * 3.4
        const angle = (thread / 30) * Math.PI * 2 + direction * step * 0.11
        const radius = 29 - step * 0.62
        const point = project(
          cablePoint(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
        )
        depth = Math.sin(angle)
        if (step === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
      }
      ctx.strokeStyle = depth > 0 ? '#a7bbb39c' : '#4a635b70'
      ctx.stroke()
    }
  }

  const pairColors = ['#bf7a3c', '#4c9575', '#5d8cbd', '#96745b']
  const segments = []
  for (let wire = 0; wire < 8; wire++) {
    for (let step = 0; step < 72; step++) {
      const a = project(conductorPoint(wire, step / 72))
      const b = project(conductorPoint(wire, (step + 1) / 72))
      segments.push({ a, b, wire, step, depth: (a.z + b.z) / 2 })
    }
  }
  segments.sort((a, b) => a.depth - b.depth)
  ctx.lineCap = 'round'
  // Paint the shared silhouette first; per-segment outlines would make the tubes beaded.
  for (const segment of segments) {
    const { a, b } = segment
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = '#09100e'
    ctx.lineWidth = 4.8 * a.perspective
    ctx.stroke()
  }
  for (const segment of segments) {
    const { a, b, wire, step } = segment
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle =
      wire % 2 === 0 || step % 9 < 2
        ? pairColors[Math.floor(wire / 2)]
        : '#d2d9ce'
    ctx.lineWidth = 4.1 * a.perspective
    ctx.stroke()
    ctx.strokeStyle = '#ecfff14a'
    ctx.lineWidth = 0.65 * a.perspective
    ctx.stroke()
  }
  for (let wire = 0; wire < 8; wire++) {
    const tip = conductorPoint(wire, 1)
    const outlet = cableOutlet(wire)
    for (let filament = 0; filament < 7; filament++) {
      const offset = (filament - 3) * 0.52
      const a = project({ x: tip.x + offset, y: tip.y, z: tip.z })
      const b = project({
        x: outlet.x + offset * 1.4,
        y: outlet.y - Math.abs(offset),
        z: outlet.z,
      })
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = filament % 2 ? '#e6b982' : '#997049'
      ctx.lineWidth = 0.55 * b.perspective
      ctx.stroke()
    }
  }
}
