import type { UserType } from '../../shared/types'
import { USER_TYPE_LABEL } from '../../shared/types'

const USER_TYPES: UserType[] = ['internal', 'joint', 'external']

interface BookingFormProps {
  userType: UserType
  attendees: number
  purpose: string
  maxAttendees: number
  submitting: boolean
  canSubmit: boolean
  errorMessage: string
  onUserTypeChange: (userType: UserType) => void
  onAttendeesChange: (attendees: number) => void
  onPurposeChange: (purpose: string) => void
  onSubmit: () => void
}

const inputClass =
  'w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none'
const labelClass = 'mb-2 block text-base font-medium text-slate-700'
const hintClass = 'mt-2 text-sm'
const submitClass =
  'mt-6 w-full min-h-12 rounded-xl bg-brand-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300'

export default function BookingForm({
  userType,
  attendees,
  purpose,
  maxAttendees,
  submitting,
  canSubmit,
  errorMessage,
  onUserTypeChange,
  onAttendeesChange,
  onPurposeChange,
  onSubmit,
}: BookingFormProps) {
  const tooMany = attendees > maxAttendees
  const tooFew = attendees < 1

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit && !submitting) onSubmit()
      }}
    >
      <h2 className="text-lg font-semibold text-slate-900">ข้อมูลผู้จอง</h2>

      <div className="mt-6 space-y-6">
        <div>
          <label className={labelClass} htmlFor="booking-user-type">
            ประเภทผู้ใช้งาน
          </label>
          <select
            id="booking-user-type"
            className={inputClass}
            value={userType}
            disabled={submitting}
            onChange={(event) => onUserTypeChange(event.target.value as UserType)}
          >
            {USER_TYPES.map((value) => (
              <option key={value} value={value}>
                {USER_TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="booking-attendees">
            จำนวนผู้เข้าใช้งาน
          </label>
          <input
            id="booking-attendees"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxAttendees}
            value={Number.isNaN(attendees) ? '' : attendees}
            disabled={submitting}
            onChange={(event) => {
              const next = Number(event.target.value)
              onAttendeesChange(Number.isNaN(next) ? 0 : next)
            }}
            className={`${inputClass} ${tooMany || tooFew ? 'border-rose-400' : ''}`}
          />
          <p className={`${hintClass} ${tooMany || tooFew ? 'text-rose-700' : 'text-slate-600'}`}>
            {tooFew
              ? 'กรุณากรอกจำนวนผู้เข้าใช้งานอย่างน้อย 1 คน'
              : tooMany
                ? `ห้องที่เลือกรองรับได้ไม่เกิน ${maxAttendees} คน`
                : `ห้องที่เลือกรองรับได้สูงสุด ${maxAttendees} คน`}
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="booking-purpose">
            วัตถุประสงค์การใช้ห้อง <span className="text-red-600">*</span>
          </label>
          <textarea
            id="booking-purpose"
            rows={3}
            maxLength={500}
            value={purpose}
            disabled={submitting}
            onChange={(event) => onPurposeChange(event.target.value)}
            placeholder="เช่น ประชุมโครงการวิจัย คณะวิศวกรรมศาสตร์"
            className={`${inputClass} min-h-32 resize-y ${purpose.trim().length === 0 ? 'border-rose-400' : ''}`}
          />
          <p className={`${hintClass} ${purpose.trim().length === 0 ? 'text-rose-700' : 'text-slate-600'}`}>
            {purpose.trim().length === 0 ? 'กรุณากรอกวัตถุประสงค์การใช้ห้อง' : `${purpose.trim().length}/500 ตัวอักษร`}
          </p>
        </div>
      </div>

      {errorMessage !== '' && (
        <p role="alert" className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">
          {errorMessage}
        </p>
      )}

      <button type="submit" disabled={!canSubmit || submitting} className={submitClass}>
        {submitting ? 'กำลังส่งคำขอจอง…' : 'ยืนยันการจอง'}
      </button>
    </form>
  )
}