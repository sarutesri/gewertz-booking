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
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-700">
        ยังไม่ได้เลือกช่วงเวลา — คลิกช่องว่างในตารางเพื่อเริ่มเลือก ({formatDate(date)})
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-base text-brand-900">
      <span>
        เลือก <span className="font-semibold">{hourRange(range.start, range.end)}</span> วันที่ {formatDate(date)} ·{' '}
        {roomNames.length === 0 ? 'ยังไม่ได้เลือกห้อง' : roomNames.join(', ')}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-brand-600 bg-white px-5 py-2 text-base font-semibold text-brand-700 transition hover:bg-brand-100 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2"
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
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4"
    >
      <p className="text-base text-rose-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-rose-700 px-5 py-2 text-base font-medium text-white transition hover:bg-rose-800 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-rose-700 focus-visible:ring-offset-2"
      >
        ลองใหม่
      </button>
    </div>
  )
}

export function EmptyPanel({ message }: { message: string }) {
  return <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-700">{message}</p>
}

export function LoadingPanel({ message }: { message: string }) {
  return (
    <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-base text-slate-700">
      {message}
    </p>
  )
}