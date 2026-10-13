export const MIN_TEMP = 18
export const MAX_TEMP = 28
export const TEMP_STEP = 0.5
export const MIN_POINTS = 4
export const MAX_POINTS = 12
export const DEFAULT_POINTS = 6

export type Point = { time: string; temp: number }
export type DaySchedule = Point[]

export const DEFAULT_DAY: DaySchedule = [
  { time: '06:00', temp: 21 },
  { time: '08:00', temp: MIN_TEMP },
  { time: '12:00', temp: 21 },
  { time: '14:00', temp: MIN_TEMP },
  { time: '18:00', temp: 21 },
  { time: '22:00', temp: MIN_TEMP },
]

export const NEW_POINT_TIME = '23:59'

/** Drops trailing points, or appends new ones at the end with NEW_POINT_TIME and the last point's temperature. */
export function resizeDay(day: DaySchedule, count: number): DaySchedule {
  const result = day.slice(0, count).map((p) => ({ ...p }))
  while (result.length < count) {
    result.push({ time: NEW_POINT_TIME, temp: result[result.length - 1].temp })
  }
  return result
}

export function clampTemp(t: number): number {
  const rounded = Math.round(t / TEMP_STEP) * TEMP_STEP
  return Math.min(MAX_TEMP, Math.max(MIN_TEMP, rounded))
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function formatDay(day: DaySchedule): string {
  return day.map((p) => `${p.time}/${p.temp.toFixed(1)}`).join(' ')
}

const POINT_RE = /^([01]\d|2[0-3]):([0-5]\d)\/(\d{1,2}(?:\.\d)?)$/

/** Parses "HH:MM/C HH:MM/C ..." – returns an error message instead of a schedule when invalid. */
export function parseDay(input: string): DaySchedule | string {
  const parts = input.trim().split(/\s+/).filter(Boolean)
  if (parts.length < MIN_POINTS || parts.length > MAX_POINTS)
    return `Oczekiwano od ${MIN_POINTS} do ${MAX_POINTS} punktów, znaleziono ${parts.length}`
  const result: DaySchedule = []
  for (const part of parts) {
    const m = POINT_RE.exec(part)
    if (!m) return `Niepoprawny punkt: "${part}"`
    const temp = Number(m[3])
    if (temp < MIN_TEMP || temp > MAX_TEMP) return `Temperatura poza zakresem ${MIN_TEMP}–${MAX_TEMP}: "${part}"`
    result.push({ time: `${m[1]}:${m[2]}`, temp: clampTemp(temp) })
  }
  return result
}

/** Returns indexes of points whose time is not later than the previous point. */
export function orderErrors(day: DaySchedule): number[] {
  const errs: number[] = []
  for (let i = 1; i < day.length; i++) {
    if (toMinutes(day[i].time) <= toMinutes(day[i - 1].time)) errs.push(i)
  }
  return errs
}

/**
 * Maps temperature to a color: violet → blue → cyan → green → yellow → orange → red → crimson.
 * Half degrees are drawn lighter than full degrees so neighbouring 0.5° steps stay distinguishable.
 */
export function tempColor(temp: number): string {
  const t = (temp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP)
  const hue = (285 - t * 300 + 360) % 360
  const lightness = Number.isInteger(temp) ? 50 : 66
  return `hsl(${hue.toFixed(0)} 85% ${lightness}%)`
}
