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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">ส่งคำขอจองเรียบร้อยแล้ว</h2>
          <p className="mt-2 text-base text-slate-700">
            รหัสการจอง <span className="font-mono text-lg font-semibold text-brand-700">{result.code}</span> · สถานะ{' '}
            {STATUS_LABEL[result.status]}
          </p>
        </div>
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-right">
          <p className="text-sm text-slate-600">ยอดที่ต้องชำระ</p>
          <p className="text-3xl font-semibold text-slate-900">{baht(result.amount)}</p>
        </div>
      </div>

      <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 text-base sm:grid-cols-3">
        <div>
          <dt className="text-sm text-slate-600">วันที่ใช้ห้อง</dt>
          <dd className="text-slate-900">{formatDate(date)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">ช่วงเวลา</dt>
          <dd className="text-slate-900">{hourRange(startHour, endHour)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">ห้องที่จอง</dt>
          <dd className="text-slate-900">{roomNames.join(', ')}</dd>
        </div>
      </dl>

      <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-base text-slate-700">
        {needsPayment
          ? 'กรุณาโอนเงินและแนบสลิปที่หน้า “การจองของฉัน” ภายในเวลาที่ระบบกำหนด หลังจากแอดมินตรวจสอบสลิปแล้วการจองจึงจะเรียบร้อย'
          : 'การจองนี้ไม่มีค่าใช้จ่าย กรุณารอแอดมินอนุมัติก่อนจึงจะถือว่าใช้ห้องได้อย่างเป็นทางการ'}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/my-bookings"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          {needsPayment ? 'ไปโอนเงินและแนบสลิป' : 'ไปดูสถานะการจอง'}
        </Link>
        <button
          type="button"
          onClick={onStartNew}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          จองห้องเพิ่ม
        </button>
      </div>
    </section>
  )
}