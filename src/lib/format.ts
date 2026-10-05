const money = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateLong = new Intl.DateTimeFormat('th-TH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
})

const dateTimeStamp = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
})

const clockStamp = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
})

const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })

/** Anything that describes "today" for the booking screen must be Bangkok time. */
export function todayISODate(): string {
  return isoDay.format(new Date())
}

export function baht(amount: number): string {
  return `${money.format(amount)} บาท`
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function hourRange(startHour: number, endHour: number): string {
  return `${hourLabel(startHour)}-${hourLabel(endHour)} น.`
}

/** Accepts `YYYY-MM-DD`, a timestamp, or a Date; always renders Thai Buddhist-era text. */
export function formatDate(value: string | number | Date): string {
  const date = toDate(value)
  return date === null ? '-' : dateLong.format(date)
}

export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value)
  return date === null ? '-' : dateTimeStamp.format(date)
}

export function formatClock(value: string | number | Date): string {
  const date = toDate(value)
  return date === null ? '-' : clockStamp.format(date)
}

/** "อีก 2 ชั่วโมง 5 นาที" / "หมดอายุแล้ว" / '' when there is no deadline. */
export function expiryText(expiresAt: number | null | undefined): string {
  if (expiresAt === null || expiresAt === undefined) return ''
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'หมดอายุแล้ว'
  const totalMinutes = Math.floor(remaining / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `อีก ${days} วัน${hours > 0 ? ` ${hours} ชั่วโมง` : ''}`
  if (hours > 0) return `อีก ${hours} ชั่วโมง${minutes > 0 ? ` ${minutes} นาที` : ''}`
  return `อีก ${Math.max(minutes, 1)} นาที`
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ไบต์`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} กิโลไบต์`
  return `${(bytes / (1024 * 1024)).toFixed(2)} เมกะไบต์`
}

function toDate(value: string | number | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') return new Date(value)
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+07:00` : value
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}