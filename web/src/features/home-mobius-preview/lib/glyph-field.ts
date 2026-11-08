/* Copyright (C) 2023-2026 QuantumNous — AGPL-3.0-or-later */

export const DATA_GLYPHS = [
  // Binary digits recur so the stream reads as machine data, not decoration.
  ...'0101100110100101ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン零壹数链流源光云网模态联接序元语界讯算ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ∞∆∑±×÷<>[]{}⟐◈◇○△□:;=+*',
]

/**
 * One 4π journey covers both sides of each lane without painting the surface twice.
 * Lanes are few and glyphs are close along them, so each lane reads as a column of
 * falling characters instead of rows packed into texture.
 */
export function createGlyphField(compact = false) {
  const columns = compact ? 420 : 720
  const lanes = compact ? 9 : 14
  let seed = 13729
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  return Array.from({ length: columns * lanes }, (_, index) => {
    const column = Math.floor(index / lanes)
    const lane = index % lanes
    const run = 18 + ((lane * 5) % 9)
    const tail = ((column + lane * 11) % run) / run
    // A streak moves as one unit at its own pace, so streaks overtake and gaps vary.
    const streak = Math.floor((column + lane * 11) / run) * 31 + lane * 7
    const streakNoise = (Math.sin(streak * 12.9898) * 43758.5453) % 1
    const streakRandom = streakNoise < 0 ? streakNoise + 1 : streakNoise
    return {
      phase:
        ((column + 0.5 + Math.sin(lane * 2.399963) * 0.35 + random() * 0.9) /
          columns) *
        Math.PI *
        4,
      lane: (lane + 0.5) / lanes,
      row: lane,
      speed: 0.25 + Math.sin(lane * 2.399963) * 0.018,
      jitterX: (random() - 0.5) * 1.4,
      jitterY: (random() - 0.5) * 1.4,
      jitterZ: (random() - 0.5) * 2,
      // Loose data: each byte keeps its own pace, wanders across its lane, and a few drift off the surface.
      pace: 0.8 + streakRandom * 0.4,
      wander: 0.04 + streakRandom * 0.1,
      wobble: streakRandom * Math.PI * 2,
      loose: random() < 0.07 ? 8 + random() * 26 : 0,
      // Position through the band's thickness, so the ring has volume instead of a single sheet.
      // Biased toward the surfaces so the silhouette stays crisp while the core reads as depth.
      depth: (() => {
        const d = random() * 2 - 1
        return Math.sign(d) * Math.abs(d) ** 0.6
      })(),
      glyph: Math.floor(random() * DATA_GLYPHS.length),
      tail,
      size: 8.2 + random() * 1.2,
      alpha: 0.34 + (1 - tail) ** 1.6 * 0.66,
      x: 0,
      y: 0,
      screenSize: 0,
      shade: 0,
    }
  })
}
