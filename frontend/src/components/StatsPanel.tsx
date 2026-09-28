import type { ReactNode } from 'react'
import type { DateStr, Project, StatsSummary, TaskRef } from '../api/types'
import { useOpenTask } from '../hooks/useOpenTask'
import { daysBetween, toDateStr } from '../lib/date'
import { isHidden } from '../lib/deleting'
import { plural, pluralTasks } from '../lib/format'
import {
  PERIODS,
  bucketize,
  formatLead,
  onTimeRate,
  peakIndex,
  percent,
  periodOf,
  pluralDays,
  signed,
  type Period,
} from '../lib/stats'
import { SkeletonBlock } from './Skeleton'
import { ListBars, MiniColumns, PrioBar, TrendChart, type ListBar } from './StatsCharts'

interface Props {
  period: Period
  onPeriod: (p: Period) => void
  data: StatsSummary | undefined
  loading: boolean
  error: string | null
  onReload: () => void
  projects: Map<number, Project>
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const WEEKDAYS_DATIVE = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям']
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? String(h) : ''))
const MAX_LISTS = 6

/** Статистика экрана «Итоги»: период, главные числа, графики и то, что сейчас в работе. */
export function StatsPanel({ period, onPeriod, data, loading, error, onReload, projects }: Props) {
  return (
    <section className="stats" aria-label="Статистика">
      <div className="chips" role="radiogroup" aria-label="период">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            role="radio"
            aria-checked={period === p.key}
            className={`chip chip-mono ${period === p.key ? 'active' : ''}`}
            onClick={() => onPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonBlock height={420} />
      ) : error || !data ? (
        <button className="error-bar" role="alert" onClick={onReload}>
          {error ?? 'не удалось загрузить статистику'} · повторить
        </button>
      ) : data.totals.done === 0 && data.totals.created === 0 && data.backlog.active === 0 ? (
        <div className="empty">
          <span className="empty-icon">◫</span>
          <span className="empty-title">за этот период пусто</span>
          <span className="empty-hint">создай или выполни задачу — здесь появятся графики</span>
        </div>
      ) : (
        <Summary data={data} period={period} projects={projects} />
      )}
    </section>
  )
}

function Summary({ data, period, projects }: { data: StatsSummary; period: Period; projects: Map<number, Project> }) {
  const { totals: t, prev } = data
  const vs = periodOf(period).vs
  const rate = onTimeRate(t)
  const prevRate = onTimeRate(prev)
  const days = data.days.length
  const createdRate = percent(t.created_done, t.created)

  return (
    <>
      <div className="kpis">
        <Kpi label="выполнено" value={String(t.done)} delta={t.done - prev.done} good="up" vs={vs} />
        <Kpi label="создано" value={String(t.created)} delta={t.created - prev.created} vs={vs} />
        <Kpi
          label="в срок"
          value={rate === null ? '—' : `${rate}%`}
          hint={t.on_time + t.late > 0 ? `${t.on_time} из ${t.on_time + t.late} с дедлайном` : 'не было дедлайнов'}
          delta={rate !== null && prevRate !== null ? rate - prevRate : undefined}
          unit="п.п."
          good="up"
          vs={vs}
        />
        <Kpi
          label="до готовности"
          value={formatLead(t.lead_hours)}
          hint="медиана: от создания до выполнения"
        />
      </div>
      <p className="stats-note">
        {t.active_days > 0 ? `${pluralDays(t.active_days)} из ${days} с выполненными` : 'ни одного дня с выполненными'}
        {createdRate !== null && ` · из созданных сделано ${t.created_done} из ${t.created} (${createdRate}%)`}
      </p>

      <Block title="выполнено и создано">
        <TrendChart buckets={bucketize(data.days, period)} />
      </Block>

      {data.lists.length > 0 && (
        <Block title="по спискам">
          <ListBars rows={listRows(data.lists, projects)} />
        </Block>
      )}

      {t.done > 0 && (
        <Block title="по приоритетам">
          <PrioBar counts={data.by_priority} />
        </Block>
      )}

      {t.done > 0 && (
        <Block title="ритм" aside={rhythmNote(data.weekday, data.hours)}>
          <div className="rhythm">
            <MiniColumns
              values={data.weekday}
              labels={WEEKDAYS}
              label="выполнено по дням недели"
              tip={(i) => `${WEEKDAYS[i]} · ${pluralTasks(data.weekday[i])}`}
            />
            <MiniColumns
              values={data.hours}
              labels={HOUR_LABELS}
              label="выполнено по часам"
              tip={(h) => `${h}:00–${h + 1}:00 · ${pluralTasks(data.hours[h])}`}
            />
          </div>
        </Block>
      )}

      <Backlog backlog={data.backlog} today={data.to} />
    </>
  )
}

function Block({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <div className="stats-block">
      <div className="section-label">
        {title}
        {aside && <span className="stats-aside">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

interface KpiProps {
  label: string
  value: string
  hint?: string
  delta?: number
  unit?: string
  /** в какую сторону изменение хорошее; без него изменение нейтральное */
  good?: 'up'
  vs?: string
}

function Kpi({ label, value, hint, delta, unit, good, vs }: KpiProps) {
  const tone = delta === undefined || delta === 0 || !good ? 'neutral' : delta > 0 ? 'good' : 'bad'
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {delta !== undefined && (
        <span className={`kpi-delta ${tone}`}>
          {signed(delta)}
          {unit ? ` ${unit}` : ''} <span className="kpi-vs">{vs}</span>
        </span>
      )}
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  )
}

function listRows(lists: StatsSummary['lists'], projects: Map<number, Project>): ListBar[] {
  const rows: ListBar[] = lists.map((l) => {
    const p = l.project_id !== null ? projects.get(l.project_id) : undefined
    return {
      key: String(l.project_id ?? 'inbox'),
      name: l.project_id === null ? 'входящие' : (p?.name ?? 'удалённый список'),
      color: l.project_id === null ? null : (p?.color ?? null),
      value: l.done,
    }
  })
  if (rows.length <= MAX_LISTS) return rows
  const rest = rows.slice(MAX_LISTS - 1)
  return [
    ...rows.slice(0, MAX_LISTS - 1),
    { key: 'other', name: `другие · ${rest.length}`, color: null, value: rest.reduce((n, r) => n + r.value, 0) },
  ]
}

function rhythmNote(weekday: number[], hours: number[]): string | undefined {
  const d = peakIndex(weekday)
  const h = peakIndex(hours)
  if (d < 0 || h < 0) return undefined
  return `чаще по ${WEEKDAYS_DATIVE[d]}, около ${h}:00`
}

function Backlog({ backlog: b, today }: { backlog: StatsSummary['backlog']; today: DateStr }) {
  const openTask = useOpenTask()
  const delayed = b.delayed.filter((t) => !isHidden(t.id))
  const oldest = b.oldest && !isHidden(b.oldest.id) ? b.oldest : null
  if (b.active === 0) return null

  return (
    <Block title="сейчас в работе" aside={pluralTasks(b.active)}>
      <div className="backlog-grid">
        <Cell value={b.overdue} label="просрочено" tone={b.overdue > 0 ? 'danger' : undefined} />
        <Cell value={b.no_dates} label="без дат" />
        <Cell value={b.inbox} label="во входящих" />
        <Cell value={b.stale} label="не трогали 30+ дней" tone={b.stale > 0 ? 'warn' : undefined} />
        <Cell value={b.postponed} label={plural(b.postponed, ['перенос', 'переноса', 'переносов'])} />
        <Cell value={b.age_days === null ? '—' : `${b.age_days} дн`} label="типичный возраст" />
      </div>

      {delayed.length > 0 && (
        <div className="stats-tasks">
          <div className="stats-sub">чаще всего переносятся</div>
          {delayed.map((t) => (
            <TaskLine key={t.id} task={t} aside={`×${t.postponed}`} onOpen={openTask} />
          ))}
        </div>
      )}
      {oldest && (
        <div className="stats-tasks">
          <div className="stats-sub">дольше всех ждёт</div>
          <TaskLine task={oldest} aside={ageLabel(oldest.created_at, today)} onOpen={openTask} />
        </div>
      )}
    </Block>
  )
}

function Cell({ value, label, tone }: { value: number | string; label: string; tone?: 'danger' | 'warn' }) {
  return (
    <div className="backlog-cell">
      <span className={`backlog-num ${tone ?? ''}`}>{value}</span>
      <span className="backlog-label">{label}</span>
    </div>
  )
}

function TaskLine({ task, aside, onOpen }: { task: TaskRef; aside: string; onOpen: (id: number) => void }) {
  return (
    <button className="stats-task" onClick={() => onOpen(task.id)}>
      <span className="stats-task-title">{task.title}</span>
      <span className="stats-task-aside mono-num">{aside}</span>
    </button>
  )
}

/** Сколько задача ждёт на день today: «82 дня». */
function ageLabel(createdAt: string, today: DateStr): string {
  const days = Math.max(0, daysBetween(toDateStr(new Date(createdAt)), today))
  return days === 0 ? 'с сегодня' : pluralDays(days)
}
