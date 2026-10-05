export type UserType = 'internal' | 'joint' | 'external'
export type RateKind = 'day' | 'evening'
export type BookingStatus =
  | 'pending_payment'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export interface Room {
  id: string
  name: string
  capacityMin: number
  capacityMax: number
  sortOrder: number
}

export interface RateCard {
  roomId: string
  userType: UserType
  rateKind: RateKind
  pricePerHour: number
}

export interface Me {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
}

export interface QuoteLine {
  roomId: string
  roomName: string
  rateKind: RateKind
  hours: number
  pricePerHour: number
  subtotal: number
}

export interface Quote {
  total: number
  lines: QuoteLine[]
}

export interface BookingSummary {
  id: string
  code: string
  activityDate: string
  startHour: number
  endHour: number
  userType: UserType
  attendees: number
  purpose: string
  status: BookingStatus
  amount: number
  quote: Quote
  hasSlip: boolean
  slipName: string | null
  paymentNote: string | null
  paymentVerifiedAt: number | null
  reviewNote: string | null
  expiresAt: number | null
  createdAt: number
  rooms: Room[]
  bookerName?: string
  bookerEmail?: string
  mine?: boolean
}

export type CellState = 'free' | 'approved' | 'held'

export interface DayCell {
  roomId: string
  hour: number
  state: CellState
  bookingId?: string
  code?: string
  byName?: string
  mine?: boolean
}

export interface Availability {
  date: string
  openStart: number
  openEnd: number
  rooms: Room[]
  cells: DayCell[]
}

export interface Settings {
  paymentInstructions: string
  contact: string
}

export const USER_TYPE_LABEL: Record<UserType, string> = {
  internal: 'หน่วยงานภายใน (ใช้ฟรี)',
  joint: 'กิจกรรมร่วมกับหน่วยงานภายใน',
  external: 'กิจกรรมของหน่วยงานภายนอก',
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: 'รอชำระเงิน',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิก',
}