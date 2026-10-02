export const MIN_TEMP = 16
export const MAX_TEMP = 28
export const TEMP_STEP = 0.5
export const POINTS_PER_DAY = 6

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

export function defaultWeek(): WeekSchedule {
  return Object.fromEntries(DAYS.map((d) => [d.key, DEFAULT_DAY.map((p) => ({ ...p }))])) as WeekSchedule
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
  if (parts.length !== POINTS_PER_DAY) return `Oczekiwano ${POINTS_PER_DAY} punktów, znaleziono ${parts.length}`
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
