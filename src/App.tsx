import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DEFAULT_DAY,
  DEFAULT_POINTS,
  MAX_POINTS,
  MAX_TEMP,
  MIN_POINTS,
  MIN_TEMP,
  TEMP_STEP,
  clampTemp,
  formatDay,
  orderErrors,
  parseDay,
  resizeDay,
  tempColor,
  toMinutes,
  type DaySchedule,
} from './schedule'

const STORAGE_KEY = 'sonoff-trv-zbt-schedule'
// key used before the app was renamed – read once so the saved schedule survives the rename
const LEGACY_STORAGE_KEY = 'avatto-trv06-schedule'

function loadSchedule(): DaySchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // older versions stored a whole week (optionally wrapped with pointCount) – keep monday
      const stored = parsed.schedule ?? parsed.week?.monday ?? parsed.monday
      if (Array.isArray(stored) && stored.length > 0) {
        // clamp in case the allowed temperature range changed since the schedule was saved
        const clamped = stored.map((p: DaySchedule[number]) => ({ ...p, temp: clampTemp(p.temp) }))
        return resizeDay(clamped, Math.min(MAX_POINTS, Math.max(MIN_POINTS, clamped.length)))
      }
    }
  } catch {
    // ignore corrupted / unavailable storage
  }
  return resizeDay(DEFAULT_DAY, DEFAULT_POINTS)
}

const POINT_OPTIONS = Array.from({ length: MAX_POINTS - MIN_POINTS + 1 }, (_, i) => MIN_POINTS + i)

export default function App() {
  const [schedule, setSchedule] = useState<DaySchedule>(loadSchedule)
  const pointCount = schedule.length

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schedule }))
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // storage unavailable
    }
  }, [schedule])

  const changePointCount = (count: number) => {
    if (count < pointCount && !confirmShrink(pointCount - count)) return
    setSchedule((s) => resizeDay(s, count))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Harmonogram Sonoff TRV-ZBT</h1>
        <p className="subtitle">
          Generator harmonogramu · {MIN_POINTS}–{MAX_POINTS} punktów · {MIN_TEMP}–{MAX_TEMP} °C
        </p>
      </header>

      <main>
        <ScheduleCard
          day={schedule}
          onChange={setSchedule}
          controls={
            <>
              <div className="points-picker" role="radiogroup" aria-label="Liczba punktów">
                <span>Liczba punktów</span>
                <div className="segmented">
                  {POINT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={n === pointCount}
                      className={n === pointCount ? 'active' : ''}
                      onClick={() => n !== pointCount && changePointCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="btn ghost"
                onClick={() => confirmReset() && setSchedule(resizeDay(DEFAULT_DAY, pointCount))}
              >
                Resetuj
              </button>
            </>
          }
        />
      </main>
    </div>
  )
}

function confirmShrink(removed: number) {
  return window.confirm(`Ostatnie punkty (${removed}) zostaną usunięte. Kontynuować?`)
}

function confirmReset() {
  return window.confirm('Przywrócić domyślny harmonogram?')
}

type ScheduleCardProps = {
  day: DaySchedule
  onChange: (day: DaySchedule) => void
  controls: ReactNode
}

function ScheduleCard({ day, onChange, controls }: ScheduleCardProps) {
  const [copied, setCopied] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const output = formatDay(day)
  const errors = orderErrors(day)

  const updatePoint = (i: number, patch: Partial<DaySchedule[number]>) =>
    onChange(day.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  const copy = async () => {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const applyImport = () => {
    const parsed = parseDay(importText)
    if (typeof parsed === 'string') {
      setImportError(parsed)
      return
    }
    onChange(parsed)
    setImportOpen(false)
    setImportText('')
    setImportError(null)
  }

  return (
    <section className="day">
      <div className="day-head">{controls}</div>

      <Timeline day={day} valid={errors.length === 0} />

      <ol className="points" style={{ '--rows': Math.ceil(day.length / 2) } as CSSProperties}>
        {day.map((p, i) => (
          <li key={i} className={errors.includes(i) ? 'point invalid' : 'point'}>
            <span className="idx">{i + 1}</span>
            <input
              type="time"
              className="time"
              value={p.time}
              onChange={(e) => e.target.value && updatePoint(i, { time: e.target.value })}
            />
            <input
              type="range"
              min={MIN_TEMP}
              max={MAX_TEMP}
              step={TEMP_STEP}
              value={p.temp}
              style={{ accentColor: tempColor(p.temp) }}
              onChange={(e) => updatePoint(i, { temp: clampTemp(Number(e.target.value)) })}
            />
            <span className="temp" style={{ '--c': tempColor(p.temp) } as CSSProperties}>
              {p.temp.toFixed(1)}°
            </span>
          </li>
        ))}
      </ol>

      {errors.length > 0 && (
        <p className="warn">Godziny muszą rosnąć – popraw punkt {errors.map((i) => i + 1).join(', ')}.</p>
      )}

      <div className="output">
        <code>{output}</code>
        <button className="btn" onClick={copy}>
          {copied ? 'Skopiowano ✓' : 'Kopiuj'}
        </button>
      </div>

      {importOpen ? (
        <div className="import">
          <input
            type="text"
            placeholder="06:00/21.0 08:00/16.0 …"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value)
              setImportError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && applyImport()}
            autoFocus
          />
          <button className="btn" onClick={applyImport}>
            Wczytaj
          </button>
          <button className="btn ghost" onClick={() => setImportOpen(false)}>
            Anuluj
          </button>
          {importError && <p className="warn">{importError}</p>}
        </div>
      ) : (
        <button className="link" onClick={() => setImportOpen(true)}>
          Wklej istniejący harmonogram
        </button>
      )}
    </section>
  )
}

const DAY_MIN = 24 * 60

/** 24h bar: each point's temperature holds until the next one; before the first point the last one (from the previous day) applies. */
function Timeline({ day, valid }: { day: DaySchedule; valid: boolean }) {
  if (!valid) return <div className="timeline disabled" />

  const segments: { start: number; end: number; temp: number }[] = []
  const first = toMinutes(day[0].time)
  if (first > 0) segments.push({ start: 0, end: first, temp: day[day.length - 1].temp })
  day.forEach((p, i) => {
    const start = toMinutes(p.time)
    const end = i + 1 < day.length ? toMinutes(day[i + 1].time) : DAY_MIN
    segments.push({ start, end, temp: p.temp })
  })

  return (
    <div className="timeline-wrap">
      <div className="timeline">
        {segments.map((s, i) => (
          <div
            key={i}
            className="seg"
            title={`${fmt(s.start)}–${fmt(s.end)}: ${s.temp.toFixed(1)} °C`}
            style={{
              left: `${(s.start / DAY_MIN) * 100}%`,
              width: `${((s.end - s.start) / DAY_MIN) * 100}%`,
              background: tempColor(s.temp),
              height: `${30 + ((s.temp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP)) * 70}%`,
            }}
          />
        ))}
      </div>
      <div className="ticks">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </div>
  )
}

function fmt(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
