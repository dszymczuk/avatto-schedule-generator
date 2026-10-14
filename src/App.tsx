import { useEffect, useState, type CSSProperties } from 'react'
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

const SCHEDULE_COUNT = 2

function sanitize(stored: unknown): DaySchedule {
  if (!Array.isArray(stored) || stored.length === 0) return resizeDay(DEFAULT_DAY, DEFAULT_POINTS)
  // clamp in case the allowed temperature range changed since the schedule was saved
  const clamped = stored.map((p: DaySchedule[number]) => ({ ...p, temp: clampTemp(p.temp) }))
  return resizeDay(clamped, Math.min(MAX_POINTS, Math.max(MIN_POINTS, clamped.length)))
}

const MAX_PROFILES = 10

type Profile = { id: string; name: string; schedules: DaySchedule[] }
type State = { profiles: Profile[]; activeId: string }

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function newProfile(name: string, schedules: unknown[] = []): Profile {
  return { id: newId(), name, schedules: Array.from({ length: SCHEDULE_COUNT }, (_, i) => sanitize(schedules[i])) }
}

/** First "Głowica N" name not used by any profile yet. */
function nextProfileName(profiles: Profile[]) {
  const names = new Set(profiles.map((p) => p.name))
  let n = profiles.length + 1
  while (names.has(`Głowica ${n}`)) n++
  return `Głowica ${n}`
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        const profiles: Profile[] = parsed.profiles.slice(0, MAX_PROFILES).map((p: Partial<Profile>, i: number) => ({
          id: typeof p.id === 'string' ? p.id : newId(),
          name: typeof p.name === 'string' ? p.name : `Głowica ${i + 1}`,
          schedules: Array.from({ length: SCHEDULE_COUNT }, (_, j) => sanitize(p.schedules?.[j])),
        }))
        const activeId = profiles.some((p) => p.id === parsed.activeId) ? parsed.activeId : profiles[0].id
        return { profiles, activeId }
      }
      // older versions had no profiles: two schedules, a single schedule, or a whole week (keep monday)
      const first = newProfile('Głowica 1', parsed.schedules ?? [parsed.schedule ?? parsed.week?.monday ?? parsed.monday])
      return { profiles: [first], activeId: first.id }
    }
  } catch {
    // ignore corrupted / unavailable storage
  }
  const first = newProfile('Głowica 1')
  return { profiles: [first], activeId: first.id }
}

const POINT_OPTIONS = Array.from({ length: MAX_POINTS - MIN_POINTS + 1 }, (_, i) => MIN_POINTS + i)

export default function App() {
  const [state, setState] = useState<State>(loadState)
  const { profiles, activeId } = state
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0]

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // storage unavailable
    }
  }, [state])

  const updateActive = (patch: Partial<Profile>) =>
    setState((s) => ({ ...s, profiles: s.profiles.map((p) => (p.id === s.activeId ? { ...p, ...patch } : p)) }))

  const setSchedule = (index: number, day: DaySchedule) =>
    updateActive({ schedules: active.schedules.map((s, i) => (i === index ? day : s)) })

  const addProfile = (copyFrom?: Profile) =>
    setState((s) => {
      if (s.profiles.length >= MAX_PROFILES) return s
      const profile = copyFrom
        ? newProfile(`${copyFrom.name} (kopia)`, copyFrom.schedules)
        : newProfile(nextProfileName(s.profiles))
      return { profiles: [...s.profiles, profile], activeId: profile.id }
    })

  const removeActive = () => {
    if (profiles.length <= 1 || !window.confirm(`Usunąć profil „${active.name}” razem z harmonogramami?`)) return
    setState((s) => {
      const idx = s.profiles.findIndex((p) => p.id === s.activeId)
      const rest = s.profiles.filter((p) => p.id !== s.activeId)
      return { profiles: rest, activeId: rest[Math.max(0, idx - 1)].id }
    })
  }

  const canAdd = profiles.length < MAX_PROFILES

  return (
    <div className="app">
      <header className="app-header">
        <h1>Harmonogram Sonoff TRV-ZBT</h1>
        <p className="subtitle">
          Generator harmonogramu · {MIN_POINTS}–{MAX_POINTS} punktów · {MIN_TEMP}–{MAX_TEMP} °C
        </p>
      </header>

      <nav className="tabs" role="tablist" aria-label="Profile">
        {profiles.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === active.id}
            className={p.id === active.id ? 'tab active' : 'tab'}
            onClick={() => setState((s) => ({ ...s, activeId: p.id }))}
          >
            {p.name.trim() || 'Bez nazwy'}
          </button>
        ))}
        <button
          className="tab add"
          onClick={() => addProfile()}
          disabled={!canAdd}
          title={canAdd ? 'Dodaj profil' : `Maksymalnie ${MAX_PROFILES} profili`}
        >
          + Dodaj profil
        </button>
      </nav>

      <div className="profile-bar">
        <label>
          <span>Nazwa profilu</span>
          <input type="text" value={active.name} maxLength={40} onChange={(e) => updateActive({ name: e.target.value })} />
        </label>
        <button className="btn ghost" onClick={() => addProfile(active)} disabled={!canAdd}>
          Duplikuj
        </button>
        <button className="btn ghost danger" onClick={removeActive} disabled={profiles.length <= 1}>
          Usuń profil
        </button>
        <span className="profile-count">
          {profiles.length}/{MAX_PROFILES} profili
        </span>
      </div>

      <main className="schedules" role="tabpanel">
        {active.schedules.map((day, i) => (
          <ScheduleCard
            key={`${active.id}-${i}`}
            title={`Harmonogram ${i + 1}`}
            day={day}
            onChange={(d) => setSchedule(i, d)}
          />
        ))}
      </main>
    </div>
  )
}

function confirmShrink(removed: number) {
  return window.confirm(`Ostatnie punkty (${removed}) zostaną usunięte. Kontynuować?`)
}

function confirmReset() {
  return window.confirm('Przywrócić domyślne wartości w tym harmonogramie?')
}

type ScheduleCardProps = {
  title: string
  day: DaySchedule
  onChange: (day: DaySchedule) => void
}

function ScheduleCard({ title, day, onChange }: ScheduleCardProps) {
  const [copied, setCopied] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const pointCount = day.length
  const output = formatDay(day)
  const errors = orderErrors(day)

  const updatePoint = (i: number, patch: Partial<DaySchedule[number]>) =>
    onChange(day.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  const movePoint = (i: number, dir: -1 | 1) => {
    const next = [...day]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    onChange(next)
  }

  const removePoint = (i: number) => onChange(day.filter((_, idx) => idx !== i))

  const sortByTime = () => onChange([...day].sort((a, b) => toMinutes(a.time) - toMinutes(b.time)))

  const copy = async () => {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const changePointCount = (count: number) => {
    if (count < pointCount && !confirmShrink(pointCount - count)) return
    onChange(resizeDay(day, count))
  }

  const applyImport = () => {
    const parsed = parseDay(importText)
    if (typeof parsed === 'string') {
      setImportError(parsed)
      return
    }
    onChange(parsed)
    setImportText('')
    setImportError(null)
  }

  return (
    <section className="day">
      <div className="day-head">
        <h2>{title}</h2>
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
          onClick={() => confirmReset() && onChange(resizeDay(DEFAULT_DAY, pointCount))}
        >
          Resetuj
        </button>
      </div>

      <Timeline day={day} valid={errors.length === 0} />

      <ol className="points" style={{ '--rows': Math.ceil(day.length / 2) } as CSSProperties}>
        {day.map((p, i) => (
          <li key={i} className={errors.includes(i) ? 'point invalid' : 'point'}>
            <span className="idx">{i + 1}</span>
            <span className="move">
              <button aria-label={`Przesuń punkt ${i + 1} w górę`} disabled={i === 0} onClick={() => movePoint(i, -1)}>
                ▲
              </button>
              <button
                aria-label={`Przesuń punkt ${i + 1} w dół`}
                disabled={i === day.length - 1}
                onClick={() => movePoint(i, 1)}
              >
                ▼
              </button>
            </span>
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
            <button
              className="remove"
              aria-label={`Usuń punkt ${i + 1}`}
              title={pointCount <= MIN_POINTS ? `Minimum ${MIN_POINTS} punkty` : 'Usuń punkt'}
              disabled={pointCount <= MIN_POINTS}
              onClick={() => removePoint(i)}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      {errors.length > 0 && (
        <div className="order-warn">
          <p className="warn">Godziny muszą rosnąć – popraw punkt {errors.map((i) => i + 1).join(', ')}.</p>
          <button className="btn" onClick={sortByTime}>
            Sortuj wg godziny
          </button>
        </div>
      )}

      <div className="output">
        <code>{output}</code>
        <button className="btn" onClick={copy}>
          {copied ? 'Skopiowano ✓' : 'Kopiuj'}
        </button>
      </div>

      <div className="import">
        <label>
          <span>Wczytaj harmonogram z tekstu</span>
          <input
            type="text"
            placeholder="06:00/21.0 08:00/18.0 12:00/21.0 14:00/18.0 …"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value)
              setImportError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && applyImport()}
          />
        </label>
        <button className="btn" onClick={applyImport} disabled={!importText.trim()}>
          Wczytaj
        </button>
        {importError && <p className="warn">{importError}</p>}
      </div>
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
