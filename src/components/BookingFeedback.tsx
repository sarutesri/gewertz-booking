import type { TimeRange } from './BookingGrid'
import { formatDate, hourRange } from '../lib/format'

export function SelectionBar({
  range,
  roomNames,
  date,
  onClear,
}: {
  range: TimeRange | null
  roomNames: string[]
  date: string
  onClear: () => void
}) {
  if (range === null) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        ยังไม่ได้เลือกช่วงเวลา — คลิกช่องว่างในตารางเพื่อเริ่มเลือก ({formatDate(date)})
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <span>
        เลือก <span className="font-semibold">{hourRange(range.start, range.end)}</span> วันที่ {formatDate(date)} ·{' '}
        {roomNames.length === 0 ? 'ยังไม่ได้เลือกห้อง' : roomNames.join(', ')}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="rounded border border-emerald-600 px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
      >
        ล้างการเลือก
      </button>
    </div>
  )
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
    >
      <p className="text-sm text-red-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
      >
        ลองใหม่
      </button>
    </div>
  )
}

export function EmptyPanel({ message }: { message: string }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p>
}

export function LoadingPanel({ message }: { message: string }) {
  return (
    <p role="status" className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
      {message}
    </p>
  )
}