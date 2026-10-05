import type { DayCell, Room } from '../../shared/types'
import { hourLabel, hourRange } from '../lib/format'

/** DayCell identity is `roomId:hour` everywhere, so the key lives with the grid. */
export function cellKey(roomId: string, hour: number): string {
  return `${roomId}:${hour}`
}

export interface TimeRange {
  start: number
  end: number
}

interface BookingGridProps {
  rooms: Room[]
  hours: number[]
  cells: ReadonlyMap<string, DayCell>
  selectedRooms: string[]
  range: TimeRange | null
  onCellClick: (roomId: string, hour: number) => void
  onToggleRoom: (roomId: string) => void
}

const CELL_CLASS: Record<DayCell['state'], string> = {
  free: 'bg-white hover:bg-emerald-50 focus-visible:ring-emerald-500',
  approved: 'bg-slate-300 text-slate-600',
  held: 'bg-amber-200 text-amber-900',
}

const CELL_TEXT: Record<DayCell['state'], string> = {
  free: 'ว่าง',
  approved: 'พักแล้ว',
  held: 'มีผู้ขอจอง',
}

export default function BookingGrid({
  rooms,
  hours,
  cells,
  selectedRooms,
  range,
  onCellClick,
  onToggleRoom,
}: BookingGridProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-44 min-w-44 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600">
              ห้อง / เวลา
            </th>
            {hours.map((hour) => (
              <th
                key={hour}
                scope="col"
                className="min-w-16 px-1 py-2 text-center text-xs font-medium text-slate-600"
              >
                {hourLabel(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            const rowSelected = selectedRooms.includes(room.id)
            return (
              <tr key={room.id} className="border-t border-slate-100">
                <th
                  scope="row"
                  className={`sticky left-0 z-10 px-3 py-2 text-left font-medium ${
                    rowSelected ? 'bg-emerald-50 text-emerald-900' : 'bg-white text-slate-900'
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rowSelected}
                      onChange={() => onToggleRoom(room.id)}
                      className="size-4 accent-emerald-600"
                    />
                    <span>{room.name}</span>
                    <span className="text-xs font-normal text-slate-500">{room.capacityMax} คน</span>
                  </label>
                </th>
                {hours.map((hour) => {
                  const cell = cells.get(cellKey(room.id, hour))
                  const state = cell?.state ?? 'free'
                  const inRange = range !== null && hour >= range.start && hour < range.end
                  const highlight = inRange && rowSelected && state === 'free'

                  if (state === 'free') {
                    return (
                      <td key={hour} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => onCellClick(room.id, hour)}
                          title={
                            rowSelected && range !== null
                              ? `เลือก ${room.name} ${hourRange(range.start, range.end)}`
                              : `เลือก ${room.name} ${hourLabel(hour)}`
                          }
                          aria-label={`${room.name} ช่วง ${hourLabel(hour)} ว่าง`}
                          aria-pressed={highlight}
                          className={`flex h-9 w-full items-center justify-center rounded-md border transition focus-visible:ring-2 focus-visible:outline-none ${
                            highlight
                              ? 'border-emerald-600 bg-emerald-600 font-semibold text-white'
                              : 'border-slate-200 bg-white'
                          } ${CELL_CLASS[state]}`}
                        >
                          {highlight ? '✓' : ''}
                        </button>
                      </td>
                    )
                  }

                  const owner = cell?.mine === true ? 'ของคุณ' : (cell?.byName ?? '')
                  return (
                    <td key={hour} className="p-0.5">
                      <div
                        title={`${room.name} ${hourLabel(hour)} · ${CELL_TEXT[state]}${owner ? ` · ${owner}` : ''}${
                          cell?.code ? ` · ${cell.code}` : ''
                        }`}
                        className={`flex h-9 items-center justify-center rounded-md border border-transparent text-[11px] leading-tight ${
                          CELL_CLASS[state]
                        } ${cell?.mine === true ? 'ring-2 ring-sky-400' : ''}`}
                      >
                        {cell?.code ?? CELL_TEXT[state]}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}