import type { HeatCell, HeatGrid } from '../lib/heatmap'
import { formatDayVi } from '../lib/time'
import { useTooltip } from './ui'

const CELL = 13
const GAP = 3
const LEFT = 26
const TOP = 16
const WEEKDAYS = ['T2', '', 'T4', '', 'T6', '', 'CN']

interface Props {
  grid: HeatGrid
  today: string
  unit: string
  frozen?: Set<string>
  selected?: string
  onSelect?: (day: string) => void
  /** Nhãn bổ sung trong chú giải nổi (vd. "đến hạn" cho lịch dự báo). */
  describe?: (cell: HeatCell) => string
}

/**
 * Lịch nhiệt kiểu GitHub: mỗi ô một ngày, mỗi cột một tuần (bắt đầu thứ Hai).
 * Cường độ dùng một dải màu xanh duy nhất; viền cam = hôm nay, viền xanh băng = ngày dùng lá chắn.
 */
export function Heatmap({ grid, today, unit, frozen, selected, onSelect, describe }: Props) {
  const tip = useTooltip()
  const width = LEFT + grid.weeks.length * (CELL + GAP)
  const height = TOP + 7 * (CELL + GAP)
  const label = (c: HeatCell) => describe?.(c) ?? `${c.value} ${unit}`

  return (
    <>
      <div className="heat-wrap" ref={(el) => void (el && !el.dataset.scrolled && ((el.scrollLeft = el.scrollWidth), (el.dataset.scrolled = '1')))}>
        <svg width={width} height={height} role="img" aria-label={`Lịch nhiệt: tổng ${grid.total} ${unit} trong ${grid.activeDays} ngày`}>
          {grid.months.map((m) => (
            <text key={`${m.col}-${m.label}`} className="heat-label" x={LEFT + m.col * (CELL + GAP)} y={10}>
              {m.label}
            </text>
          ))}
          {WEEKDAYS.map((w, i) => (
            <text key={i} className="heat-label" x={0} y={TOP + i * (CELL + GAP) + CELL - 3}>
              {w}
            </text>
          ))}
          {grid.weeks.map((week, x) =>
            week.map((cell, y) => {
              if (!cell) return null
              const px = LEFT + x * (CELL + GAP)
              const py = TOP + y * (CELL + GAP)
              const isFrozen = frozen?.has(cell.day)
              return (
                <g key={cell.day}>
                  <rect
                    className={`heat-cell ${cell.future ? 'future' : `l${cell.level}`} ${selected === cell.day ? 'sel' : ''}`}
                    x={px}
                    y={py}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    data-day={cell.day}
                    onMouseMove={(e) =>
                      !cell.future &&
                      tip.show(
                        e,
                        <>
                          <b>{label(cell)}</b>
                          {isFrozen ? ' · dùng lá chắn' : ''}
                          <br />
                          {formatDayVi(cell.day, { weekday: true })}
                        </>,
                      )
                    }
                    onMouseLeave={tip.hide}
                    onClick={() => !cell.future && onSelect?.(cell.day)}
                  >
                    <title>{`${formatDayVi(cell.day, { weekday: true })}: ${label(cell)}`}</title>
                  </rect>
                  {isFrozen && <rect className="heat-frozen" x={px + 1} y={py + 1} width={CELL - 2} height={CELL - 2} rx={2} />}
                  {cell.day === today && <rect className="heat-today" x={px - 1} y={py - 1} width={CELL + 2} height={CELL + 2} rx={4} />}
                </g>
              )
            }),
          )}
        </svg>
      </div>
      {tip.node}
    </>
  )
}

export function HeatLegend({ thresholds, unit, showFrozen }: { thresholds: [number, number, number]; unit: string; showFrozen?: boolean }) {
  const ranges = ['0', `1–${thresholds[0]}`, `${thresholds[0] + 1}–${thresholds[1]}`, `${thresholds[1] + 1}–${thresholds[2]}`, `>${thresholds[2]}`]
  return (
    <div className="legend">
      <span className="scale" aria-label={`Thang màu: ${ranges.join(', ')} ${unit}`}>
        Ít
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="swatch" style={{ background: `var(--heat-${l})` }} title={`${ranges[l]} ${unit}`} />
        ))}
        Nhiều
      </span>
      <span className="key">
        <span className="swatch" style={{ boxShadow: 'inset 0 0 0 2px var(--flame)' }} /> Hôm nay
      </span>
      {showFrozen && (
        <span className="key">
          <span className="swatch" style={{ boxShadow: 'inset 0 0 0 2px var(--ice)' }} /> Dùng lá chắn
        </span>
      )}
    </div>
  )
}
