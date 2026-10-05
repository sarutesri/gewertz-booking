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
  free: 'bg-white hover:bg-brand-50 focus-visible:ring-brand-600',
  approved: 'bg-slate-300 text-slate-800',
  held: 'bg-amber-200 text-amber-900',
}

const CELL_TEXT: Record<DayCell['state'], string> = {
  free: 'ว่าง',
  approved: 'พักแล้ว',
  held: 'มีผู้ขอจอง',
}

/** ช่วงเวลาที่ผ่านไปแล้ว — เลือกไม่ได้ จึงไม่มี hover สีอื่น */
const PAST_CLASS = 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'

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
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-48 min-w-48 bg-white px-3 py-3 text-left text-base font-semibold text-slate-700">
              ห้อง / เวลา
            </th>
            {hours.map((hour) => (
              <th
                key={hour}
                scope="col"
                className="min-w-14 px-1 py-3 text-center text-sm font-semibold text-slate-700"
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
                  className={`sticky left-0 z-10 px-4 py-3 text-left font-medium ${
                    rowSelected ? 'bg-brand-50 text-brand-900' : 'bg-white text-slate-900'
                  }`}
                >
                  <label className="flex min-h-12 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={rowSelected}
                      onChange={() => onToggleRoom(room.id)}
                      className="size-5 shrink-0 accent-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none focus-visible:ring-offset-2"
                    />
                    <span>{room.name}</span>
                    <span className="text-sm font-normal text-slate-500">{room.capacityMax} คน</span>
                  </label>
                </th>
                {hours.map((hour) => {
                  const cell = cells.get(cellKey(room.id, hour))
                  const state = cell?.state ?? 'free'
                  const inRange = range !== null && hour >= range.start && hour < range.end
                  const highlight = inRange && rowSelected && state === 'free' && cell?.past !== true

                  // เวลาที่ผ่านไปแล้ว: เทาจาง ไม่กดได้ ไม่มีวงแหวนโฟกัส
                  if (cell?.past === true) {
                    const owner = cell.mine === true ? 'ของคุณ' : (cell.byName ?? '')
                    return (
                      <td key={hour} className="p-1">
                        <div
                          title={`${room.name} ${hourLabel(hour)} · เลยเวลาแล้ว${
                            owner ? ` · ${owner}` : ''
                          }${cell.code ? ` · ${cell.code}` : ''}`}
                          aria-disabled="true"
                          className={`flex h-12 min-w-14 items-center justify-center rounded-lg border text-xs leading-tight ${PAST_CLASS}`}
                        >
                          {cell.code ?? ''}
                        </div>
                      </td>
                    )
                  }

                  if (state === 'free') {
                    return (
                      <td key={hour} className="p-1">
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
                          className={`flex h-12 min-w-14 items-center justify-center rounded-lg border transition focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-offset-2 ${
                            highlight
                              ? 'border-brand-600 bg-brand-600 font-semibold text-white'
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
                    <td key={hour} className="p-1">
                      <div
                        title={`${room.name} ${hourLabel(hour)} · ${CELL_TEXT[state]}${owner ? ` · ${owner}` : ''}${
                          cell?.code ? ` · ${cell.code}` : ''
                        }`}
                        className={`flex h-12 min-w-14 items-center justify-center rounded-lg border border-transparent text-xs leading-tight ${CELL_CLASS[state]} ${
                          cell?.mine === true ? 'ring-2 ring-sky-400' : ''
                        }`}
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