import { motion } from 'framer-motion'
import type { CSSProperties, ReactNode } from 'react'
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
  perDay,
  percent,
  periodOf,
  pluralDays,
  signed,
  type Period,
} from '../lib/stats'
import { SkeletonBlock } from './Skeleton'
import { EmptyState } from './EmptyState'
import { HourStrip, ListBars, PrioBar, Ring, TrendChart, WeekdayColumns, type ListBar } from './StatsCharts'

interface Props {
  period: Period
  onPeriod: (p: Period) => void
  data: StatsSummary | undefined
  loading: boolean
  error: string | null
  onReload: () => void
  projects: Map<number, Project>
}

const WEEKDAYS_DATIVE = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям']
const MAX_LISTS = 6

/** Статистика экрана «Итоги»: период, главная карточка с графиком, плитки и блоки-карточки. */
export function StatsPanel({ period, onPeriod, data, loading, error, onReload, projects }: Props) {
  return (
    <section className="stats" aria-label="Статистика">
      <div className="period" role="radiogroup" aria-label="период">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            role="radio"
            aria-checked={period === p.key}
            className={`period-btn ${period === p.key ? 'active' : ''}`}
            onClick={() => onPeriod(p.key)}
          >
            {period === p.key && (
              <motion.span
                layoutId="period-pill"
                className="period-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="period-label">{p.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <>
          <SkeletonBlock height={330} />
          <SkeletonBlock height={120} />
        </>
      ) : error || !data ? (
        <button className="error-bar" role="alert" onClick={onReload}>
          {error ?? 'не удалось загрузить статистику'} · повторить
        </button>
      ) : data.totals.done === 0 && data.totals.created === 0 && data.backlog.active === 0 ? (
        <div className="stats-card">
          <EmptyState art="chart" title="за этот период пусто" hint="создай или выполни задачу — здесь появятся графики" />
        </div>
      ) : (
        // key: при смене периода карточки заново «въезжают»
        <Summary key={period} data={data} period={period} projects={projects} />
      )}
    </section>
  )
}

function Summary({ data, period, projects }: { data: StatsSummary; period: Period; projects: Map<number, Project> }) {
  const { totals: t, prev } = data
  const vs = periodOf(period).vs
  const days = data.days.length
  const rate = onTimeRate(t)
  const prevRate = onTimeRate(prev)
  const createdRate = percent(t.created_done, t.created)
  const d = data.weekday
  const peakDay = peakIndex(d)
  const peakHour = peakIndex(data.hours)
  let order = 0
  const next = () => ({ '--i': order++ }) as CSSProperties

  return (
    <>
      <div className="stats-card hero" style={next()}>
        <div className="hero-head">
          <div className="hero-main">
            <span className="sc-kicker">выполнено</span>
            <div className="hero-figure">
              <span className="hero-num">{t.done}</span>
              <Delta value={t.done - prev.done} good="up" />
            </div>
            <span className="hero-sub">
              ≈ {perDay(t.done, days)} в день · {vs}
            </span>
          </div>
          <div className="hero-legend" aria-hidden="true">
            <span>
              <i className="key key-done" /> выполнено
            </span>
            <span>
              <i className="key key-created" /> создано
            </span>
          </div>
        </div>

        <TrendChart buckets={bucketize(data.days, period)} />

        <div className="hero-foot">
          <Metric label="создано" value={String(t.created)} extra={<Delta value={t.created - prev.created} />} />
          <Metric label="из созданных сделано" value={createdRate === null ? '—' : `${createdRate}%`} />
          <Metric label="дней с выполненными" value={`${t.active_days}`} extra={<span className="metric-of">из {days}</span>} />
        </div>
      </div>

      <div className="tiles" style={next()}>
        <div className="stats-card tile">
          <Ring value={rate} />
          <div className="tile-body">
            <span className="sc-kicker">в срок</span>
            <span className="tile-num">{rate === null ? '—' : `${rate}%`}</span>
            <span className="tile-hint">
              {t.on_time + t.late > 0 ? `${t.on_time} из ${t.on_time + t.late} с дедлайном` : 'не было дедлайнов'}
            </span>
            {rate !== null && prevRate !== null && <Delta value={rate - prevRate} unit="п.п." good="up" />}
          </div>
        </div>
        <div className="stats-card tile">
          <div className="tile-body">
            <span className="sc-kicker">до готовности</span>
            <span className="tile-num">{formatLead(t.lead_hours)}</span>
            <span className="tile-hint">медиана от создания до галочки</span>
            {prev.lead_hours !== null && t.lead_hours !== null && (
              <span className="tile-hint">было {formatLead(prev.lead_hours)}</span>
            )}
          </div>
        </div>
      </div>

      {data.lists.length > 0 && (
        <Card title="по спискам" style={next()}>
          <ListBars rows={listRows(data.lists, projects)} />
        </Card>
      )}

      {t.done > 0 && (
        <Card title="по приоритетам" style={next()}>
          <PrioBar counts={data.by_priority} />
        </Card>
      )}

      {t.done > 0 && (
        <Card
          title="ритм"
          aside={peakDay >= 0 && peakHour >= 0 ? `чаще по ${WEEKDAYS_DATIVE[peakDay]}, около ${peakHour}:00` : undefined}
          style={next()}
        >
          <WeekdayColumns values={d} />
          <div className="sc-sub">по часам</div>
          <HourStrip values={data.hours} />
        </Card>
      )}

      <Backlog backlog={data.backlog} today={data.to} style={next()} />
    </>
  )
}

function Card({ title, aside, style, children }: { title: string; aside?: ReactNode; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className="stats-card" style={style}>
      <div className="sc-head">
        <span className="sc-title">{title}</span>
        {aside && <span className="sc-aside">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

/** Изменение к прошлому периоду: зелёное/красное, если у метрики есть хорошая сторона, иначе нейтральное. */
function Delta({ value, unit, good }: { value: number; unit?: string; good?: 'up' }) {
  const tone = value === 0 || !good ? 'neutral' : value > 0 ? 'good' : 'bad'
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : ''
  return (
    <span className={`delta ${tone}`}>
      {arrow}
      {signed(value).replace(/^[+−]/, '')}
      {unit ? ` ${unit}` : ''}
    </span>
  )
}

function Metric({ label, value, extra }: { label: string; value: string; extra?: ReactNode }) {
  return (
    <div className="metric">
      <span className="metric-value">
        {value} {extra}
      </span>
      <span className="metric-label">{label}</span>
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

function Backlog({ backlog: b, today, style }: { backlog: StatsSummary['backlog']; today: DateStr; style: CSSProperties }) {
  const openTask = useOpenTask()
  const delayed = b.delayed.filter((t) => !isHidden(t.id))
  const oldest = b.oldest && !isHidden(b.oldest.id) ? b.oldest : null
  if (b.active === 0) return null

  return (
    <Card title="сейчас в работе" aside={pluralTasks(b.active)} style={style}>
      <div className="backlog-grid">
        <Cell value={b.overdue} label="просрочено" tone={b.overdue > 0 ? 'danger' : undefined} />
        <Cell value={b.no_dates} label="без дат" />
        <Cell value={b.inbox} label="во входящих" />
        <Cell value={b.stale} label="не трогали 30+ дн" tone={b.stale > 0 ? 'warn' : undefined} />
        <Cell value={b.postponed} label={plural(b.postponed, ['перенос', 'переноса', 'переносов'])} />
        <Cell value={b.age_days === null ? '—' : `${b.age_days} дн`} label="типичный возраст" />
      </div>

      {delayed.length > 0 && (
        <div className="stats-tasks">
          <div className="sc-sub">чаще всего переносятся</div>
          {delayed.map((t) => (
            <TaskLine key={t.id} task={t} aside={`×${t.postponed}`} onOpen={openTask} />
          ))}
        </div>
      )}
      {oldest && (
        <div className="stats-tasks">
          <div className="sc-sub">дольше всех ждёт</div>
          <TaskLine task={oldest} aside={ageLabel(oldest.created_at, today)} onOpen={openTask} />
        </div>
      )}
    </Card>
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
      <span className="stats-task-aside">{aside}</span>
      <span className="stats-task-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  )
}

/** Сколько задача ждёт на день today: «82 дня». */
function ageLabel(createdAt: string, today: DateStr): string {
  const days = Math.max(0, daysBetween(toDateStr(new Date(createdAt)), today))
  return days === 0 ? 'с сегодня' : pluralDays(days)
}
