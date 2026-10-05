export const MIN_TEMP = 16
export const MAX_TEMP = 28
export const TEMP_STEP = 0.5
export const MIN_POINTS = 4
export const MAX_POINTS = 8
export const DEFAULT_POINTS = 6

export type Point = { time: string; temp: number }
export type DaySchedule = Point[]

export const DAYS = [
  { key: 'monday', label: 'Poniedziałek' },
  { key: 'tuesday', label: 'Wtorek' },
  { key: 'wednesday', label: 'Środa' },
  { key: 'thursday', label: 'Czwartek' },
  { key: 'friday', label: 'Piątek' },
  { key: 'saturday', label: 'Sobota' },
  { key: 'sunday', label: 'Niedziela' },
] as const

export type DayKey = (typeof DAYS)[number]['key']
export type WeekSchedule = Record<DayKey, DaySchedule>

export const DEFAULT_DAY: DaySchedule = [
  { time: '06:00', temp: 21 },
  { time: '08:00', temp: 16 },
  { time: '12:00', temp: 21 },
  { time: '14:00', temp: 16 },
  { time: '18:00', temp: 21 },
  { time: '22:00', temp: 16 },
]

export function defaultWeek(count = DEFAULT_POINTS): WeekSchedule {
  return Object.fromEntries(DAYS.map((d) => [d.key, resizeDay(DEFAULT_DAY, count)])) as WeekSchedule
}

export function resizeWeek(week: WeekSchedule, count: number): WeekSchedule {
  return Object.fromEntries(DAYS.map((d) => [d.key, resizeDay(week[d.key], count)])) as WeekSchedule
}

/**
 * Drops trailing points, or inserts new ones into the largest time gap.
 * A new point copies the temperature of the point before it, so the effective schedule doesn't change.
 */
export function resizeDay(day: DaySchedule, count: number): DaySchedule {
  const result = day.slice(0, count).map((p) => ({ ...p }))
  while (result.length < count) {
    let bestIdx = result.length - 1
    let bestGap = 24 * 60 - toMinutes(result[bestIdx].time)
    for (let i = 0; i < result.length - 1; i++) {
      const gap = toMinutes(result[i + 1].time) - toMinutes(result[i].time)
      if (gap > bestGap) {
        bestGap = gap
        bestIdx = i
      }
    }
    const start = toMinutes(result[bestIdx].time)
    const mid = start + Math.max(5, Math.floor(bestGap / 2 / 5) * 5)
    result.splice(bestIdx + 1, 0, { time: fromMinutes(Math.min(mid, 24 * 60 - 1)), temp: result[bestIdx].temp })
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

export function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function formatDay(day: DaySchedule): string {
  return day.map((p) => `${p.time}/${p.temp.toFixed(1)}`).join(' ')
}

const POINT_RE = /^([01]\d|2[0-3]):([0-5]\d)\/(\d{1,2}(?:\.\d)?)$/

/** Parses "HH:MM/C HH:MM/C ..." – returns an error message instead of a schedule when invalid. */
export function parseDay(input: string, count: number): DaySchedule | string {
  const parts = input.trim().split(/\s+/).filter(Boolean)
  if (parts.length !== count)
    return `Oczekiwano ${count} punktów, znaleziono ${parts.length} – zmień liczbę punktów na dzień`
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

/** Maps temperature to a color from cool blue (16°C) to warm red (28°C). */
export function tempColor(temp: number): string {
  const t = (temp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP)
  const hue = 210 - t * 210
  return `hsl(${hue} 75% 55%)`
}
