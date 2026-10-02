import { useEffect, useState } from 'react'
import {
  DAYS,
  MAX_TEMP,
  MIN_TEMP,
  TEMP_STEP,
  clampTemp,
  defaultWeek,
  formatDay,
  orderErrors,
  parseDay,
  tempColor,
  toMinutes,
  type DayKey,
  type DaySchedule,
  type WeekSchedule,
} from './schedule'

const STORAGE_KEY = 'avatto-trv06-schedule'

function loadWeek(): WeekSchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultWeek(), ...JSON.parse(raw) }
  } catch {
    // ignore corrupted / unavailable storage
  }
  return defaultWeek()
}

export default function App() {
  const [week, setWeek] = useState<WeekSchedule>(loadWeek)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(week))
    } catch {
      // storage unavailable
    }
  }, [week])

  const setDay = (key: DayKey, day: DaySchedule) => setWeek((w) => ({ ...w, [key]: day }))

  const copyDayTo = (from: DayKey, targets: DayKey[]) =>
    setWeek((w) => {
      const next = { ...w }
      for (const t of targets) next[t] = w[from].map((p) => ({ ...p }))
      return next
    })

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>AVATTO TRV06</h1>
          <p className="subtitle">Generator harmonogramu · 6 punktów na dzień · {MIN_TEMP}–{MAX_TEMP} °C</p>
        </div>
        <button
          className="btn ghost"
          onClick={() => confirmReset() && setWeek(defaultWeek())}
        >
          Resetuj wszystko
        </button>
      </header>

      <main className="days">
        {DAYS.map((d) => (
          <DayCard
            key={d.key}
            dayKey={d.key}
            label={d.label}
            day={week[d.key]}
            onChange={(day) => setDay(d.key, day)}
            onCopyTo={(targets) => copyDayTo(d.key, targets)}
          />
        ))}
      </main>
    </div>
  )
}

function confirmReset() {
  return window.confirm('Przywrócić domyślny harmonogram dla wszystkich dni?')
}

type DayCardProps = {
  dayKey: DayKey
  label: string
  day: DaySchedule
  onChange: (day: DaySchedule) => void
  onCopyTo: (targets: DayKey[]) => void
}

function DayCard({ dayKey, label, day, onChange, onCopyTo }: DayCardProps) {
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

  const otherDays = DAYS.filter((d) => d.key !== dayKey)
  const weekdays = otherDays.filter((d) => !['saturday', 'sunday'].includes(d.key)).map((d) => d.key)

  return (
    <section className="day">
      <div className="day-head">
        <h2>{label}</h2>
        <select
          className="copy-select"
          value=""
          onChange={(e) => {
            const v = e.target.value
            if (v === 'all') onCopyTo(otherDays.map((d) => d.key))
            else if (v === 'weekdays') onCopyTo(weekdays)
            else if (v) onCopyTo([v as DayKey])
          }}
        >
          <option value="">Kopiuj do…</option>
          <option value="all">Wszystkich dni</option>
          <option value="weekdays">Dni roboczych (pn–pt)</option>
          {otherDays.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <Timeline day={day} valid={errors.length === 0} />

      <ol className="points">
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
            <span className="temp" style={{ color: tempColor(p.temp) }}>
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
