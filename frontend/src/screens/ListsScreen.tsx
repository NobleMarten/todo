import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Project } from '../api/types'
import { ColorSwatches } from '../components/ProjectPicker'
import { ProjectRow } from '../components/ProjectRow'
import { Logo, ScreenHeader } from '../components/ScreenHeader'
import { SkeletonRows } from '../components/Skeleton'
import {
  AlertIcon,
  ChevronIcon,
  LinesIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  TargetIcon,
  WeekIcon,
} from '../components/icons'
import { useProjects } from '../hooks/useProjects'
import { useSmartCounts } from '../hooks/useTasks'
import type { Theme } from '../hooks/useTheme'
import { plural, PROJECT_COLORS, PROJECT_NAME_MAX } from '../lib/format'

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

/** Экран «Списки» (макет B1): смарт-виды 2×2, «мои списки», «новый список». */
export function ListsScreen({ theme, onToggleTheme }: Props) {
  const { projects, archived, loading, error, actionError, clearActionError, reload, create, update } = useProjects()
  const counts = useSmartCounts()
  const [showArchived, setShowArchived] = useState(false)

  const smart: { to: string; label: string; icon: ReactNode; count?: number; tone: string }[] = [
    { to: '/lists/today', label: 'Сегодня', icon: <TargetIcon size={19} />, count: counts?.today, tone: 'accent' },
    { to: '/lists/week', label: '7 дней', icon: <WeekIcon size={19} />, count: counts?.week, tone: 'plain' },
    { to: '/lists/overdue', label: 'Просрочено', icon: <AlertIcon size={19} />, count: counts?.overdue, tone: 'danger' },
    { to: '/lists/all', label: 'Все задачи', icon: <LinesIcon size={19} />, count: counts?.all, tone: 'plain' },
  ]
  // «Просрочено» скрываем при нуле (раздел 5)
  const visible = smart.filter((s) => s.tone !== 'danger' || (s.count ?? 0) > 0)

  return (
    <div className="screen">
      <div className="eyebrow">
        <Logo />
      </div>
      <ScreenHeader
        title="Списки"
        aside={counts ? `${counts.all} ${plural(counts.all, ['активная', 'активных', 'активных'])}` : undefined}
        right={
          <>
            <Link className="box-btn" to="/search" aria-label="поиск">
              <span className="box">
                <SearchIcon />
              </span>
            </Link>
            <button
              className="box-btn"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'светлая тема' : 'тёмная тема'}
            >
              <span className="box">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
            </button>
          </>
        }
      />

      <div className="smart-grid">
        {visible.map((s) => (
          <Link key={s.to} to={s.to} className={`smart-card tone-${s.tone}`}>
            <span className="smart-top">
              <span className="smart-icon">{s.icon}</span>
              <span className="smart-count">{s.count ?? '·'}</span>
            </span>
            <span className="smart-label">{s.label}</span>
          </Link>
        ))}
      </div>

      {error && (
        <button className="error-bar" onClick={() => reload()}>
          {error} · повторить
        </button>
      )}
      {actionError && (
        <button className="error-bar" onClick={clearActionError}>
          {actionError}
        </button>
      )}

      <section className="lists-section">
        <div className="section-label">мои списки</div>
        <div className="rows">
          <ProjectRow to="/lists/inbox" name="входящие" color={null} active={counts?.inbox} />
          {loading && projects.length === 0 ? (
            <SkeletonRows count={4} variant="project" />
          ) : (
            projects.map((p) => (
              <ProjectRow
                key={p.id}
                to={`/lists/${p.id}`}
                name={p.name}
                color={p.color}
                active={p.counts?.active}
                overdue={p.counts?.overdue}
              />
            ))
          )}
          <NewProject onCreate={create} nextColor={PROJECT_COLORS[projects.length % PROJECT_COLORS.length]} />
        </div>
      </section>

      {archived.length > 0 && (
        <section className="lists-section">
          <button
            className="section-label section-toggle"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
          >
            в архиве · {archived.length}
            <ChevronIcon open={showArchived} />
          </button>
          {showArchived && (
            <div className="rows archived">
              {archived.map((p) => (
                <ProjectRow
                  key={p.id}
                  to={`/lists/${p.id}`}
                  name={p.name}
                  color={p.color}
                  action={
                    <button className="chip" onClick={() => update(p.id, { archived: false })}>
                      вернуть
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** Строка «новый список» с пунктирной рамкой; по нажатию раскрывается в форму. */
function NewProject({
  onCreate,
  nextColor,
}: {
  onCreate: (name: string, color: string) => Promise<Project | null>
  nextColor: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    const created = await onCreate(n, color ?? nextColor)
    setBusy(false)
    if (created) {
      setName('')
      setColor(null)
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <button className="new-project" onClick={() => setOpen(true)}>
        <PlusIcon />
        новый список
      </button>
    )
  }

  return (
    <form className="new-project open" onSubmit={submit}>
      <input
        className="text-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="название списка"
        aria-label="название списка"
        maxLength={PROJECT_NAME_MAX}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <ColorSwatches value={color ?? nextColor} onPick={setColor} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          отмена
        </button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>
          создать
        </button>
      </div>
    </form>
  )
}
