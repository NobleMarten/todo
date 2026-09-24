import type { Project } from '../api/types'
import { PROJECT_COLORS } from '../lib/format'
import { CheckIcon } from './icons'

interface Props {
  projects: Project[]
  value: number | null // null — «Входящие»
  onPick: (id: number | null) => void
}

/** Выбор списка для задачи: «входящие» плюс активные списки. */
export function ProjectPicker({ projects, value, onPick }: Props) {
  const options: { id: number | null; name: string; color: string | null }[] = [
    { id: null, name: 'входящие', color: null },
    ...projects.map((p) => ({ id: p.id, name: p.name, color: p.color })),
  ]

  return (
    <ul className="picker" role="listbox" aria-label="список">
      {options.map((o) => (
        <li key={o.id ?? 'inbox'}>
          <button
            className={`picker-row ${o.id === value ? 'selected' : ''}`}
            role="option"
            aria-selected={o.id === value}
            onClick={() => onPick(o.id)}
          >
            <span className={`dot ${o.color ? '' : 'dot-hollow'}`} style={o.color ? { background: o.color } : undefined} />
            <span className="picker-name">{o.name}</span>
            {o.id === value && <CheckIcon />}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Палитра цветов списка. */
export function ColorSwatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="цвет списка">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'active' : ''}`}
          style={{ background: c }}
          role="radio"
          aria-checked={c.toLowerCase() === value.toLowerCase()}
          aria-label={c}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  )
}
