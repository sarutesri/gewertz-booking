import type { QuoteLine, RateCard, RateKind, Room, UserType } from '../../shared/types'
import { baht } from '../lib/format'

/** The announcement prices 08:00-16:00 as half/full day and everything from 16:00 per hour. */
const EVENING_START_HOUR = 16

export const RATE_KIND_LABEL: Record<RateKind, string> = {
  day: 'ช่วงกลางวัน 08:00-16:00',
  evening: 'ช่วงหลัง 16:00 เป็นต้น',
}

export interface QuoteInput {
  rooms: Room[]
  rates: RateCard[]
  userType: UserType
  startHour: number
  endHour: number
}

/** Mirrors `quoteRooms()` in worker/pricing.ts so the preview matches the server's total. */
export function buildQuote({ rooms, rates, userType, startHour, endHour }: QuoteInput): QuoteLine[] {
  const priceFor = (roomId: string, rateKind: RateKind) =>
    rates.find(
      (rate) => rate.roomId === roomId && rate.userType === userType && rate.rateKind === rateKind,
    )?.pricePerHour ?? 0

  const kindOf = (hour: number): RateKind => (hour >= EVENING_START_HOUR ? 'evening' : 'day')

  const lines: QuoteLine[] = []
  for (const room of rooms) {
    let hour = startHour
    while (hour < endHour) {
      const rateKind = kindOf(hour)
      let runEnd = hour
      while (runEnd < endHour && kindOf(runEnd) === rateKind) runEnd += 1
      const pricePerHour = priceFor(room.id, rateKind)
      const hours = runEnd - hour
      lines.push({ roomId: room.id, roomName: room.name, rateKind, hours, pricePerHour, subtotal: hours * pricePerHour })
      hour = runEnd
    }
  }
  return lines
}

interface QuotePanelProps {
  lines: QuoteLine[]
  /** Shown instead of the breakdown when the user has not finished picking. */
  emptyHint: string
}

export default function QuotePanel({ lines, emptyHint }: QuotePanelProps) {
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">ค่าใช้จ่ายโดยประมาณ</h2>

      {lines.length === 0 ? (
        <p className="mt-4 text-base text-slate-700">{emptyHint}</p>
      ) : (
        <>
          <div className="mt-5 space-y-3">
            {lines.map((line) => (
              <div key={`${line.roomId}:${line.rateKind}`} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-medium text-slate-900">{line.roomName}</span>
                  <span className="text-base font-semibold text-slate-900">{baht(line.subtotal)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span className="rounded bg-white px-2 py-0.5 ring-1 ring-slate-200">
                    {RATE_KIND_LABEL[line.rateKind]}
                  </span>
                  <span>
                    {line.hours} ชั่วโมง × {baht(line.pricePerHour)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-200 pt-5">
            <span className="text-base font-medium text-slate-700">ยอดรวมทั้งหมด</span>
            <span className="text-3xl font-semibold text-slate-900">{baht(total)}</span>
          </div>

          {total === 0 ? (
            <p className="mt-3 text-sm text-slate-600">หน่วยงานภายในใช้ห้องฟรี ไม่ต้องชำระเงิน ระบบจะส่งให้แอดมินอนุมัติ</p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">ยอดจริงจะคำนวณซ้ำโดยเซิร์ฟเวอร์อีกครั้งตอนกดยืนยัน</p>
          )}
        </>
      )}
    </section>
  )
}