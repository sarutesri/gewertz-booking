import { Link } from 'react-router-dom'
import type { CreateBookingResult } from '../lib/api'
import { STATUS_LABEL } from '../../shared/types'
import { baht, formatDate, hourRange } from '../lib/format'

interface BookingConfirmationProps {
  result: CreateBookingResult
  date: string
  roomNames: string[]
  startHour: number
  endHour: number
  onStartNew: () => void
}

export default function BookingConfirmation({
  result,
  date,
  roomNames,
  startHour,
  endHour,
  onStartNew,
}: BookingConfirmationProps) {
  const needsPayment = result.status === 'pending_payment'

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-emerald-900">ส่งคำขอจองเรียบร้อยแล้ว</h2>
          <p className="mt-1 text-sm text-emerald-800">
            รหัสการจอง <span className="font-mono text-base font-semibold">{result.code}</span> · สถานะ{' '}
            {STATUS_LABEL[result.status]}
          </p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-right">
          <p className="text-xs text-slate-500">ยอดที่ต้องชำระ</p>
          <p className="text-xl font-semibold text-emerald-700">{baht(result.amount)}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">วันที่ใช้ห้อง</dt>
          <dd className="text-slate-900">{formatDate(date)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">ช่วงเวลา</dt>
          <dd className="text-slate-900">{hourRange(startHour, endHour)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">ห้องที่จอง</dt>
          <dd className="text-slate-900">{roomNames.join(', ')}</dd>
        </div>
      </dl>

      <p className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
        {needsPayment
          ? 'กรุณาโอนเงินและแนบสลิปที่หน้า “การจองของฉัน” ภายในเวลาที่ระบบกำหนด หลังจากแอดมินตรวจสอบสลิปแล้วการจองจึงจะเรียบร้อย'
          : 'การจองนี้ไม่มีค่าใช้จ่าย กรุณารอแอดมินอนุมัติก่อนจึงจะถือว่าใช้ห้องได้อย่างเป็นทางการ'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/my-bookings"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          {needsPayment ? 'ไปโอนเงินและแนบสลิป' : 'ไปดูสถานะการจอง'}
        </Link>
        <button
          type="button"
          onClick={onStartNew}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          จองห้องเพิ่ม
        </button>
      </div>
    </section>
  )
}