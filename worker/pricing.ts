import type { Quote, QuoteLine, RateCard, RateKind, Room, UserType } from '../shared/types'

/** The announcement prices 08:00-16:00 as half/full day and everything from 16:00 per hour. */
export const EVENING_START_HOUR = 16

export function rateKindForHour(hour: number): RateKind {
  return hour >= EVENING_START_HOUR ? 'evening' : 'day'
}

export function quoteRooms(options: {
  rooms: Room[]
  rates: RateCard[]
  userType: UserType
  startHour: number
  endHour: number
}): Quote {
  const { rooms, rates, userType, startHour, endHour } = options
  const priceFor = (roomId: string, kind: RateKind) =>
    rates.find((rate) => rate.roomId === roomId && rate.userType === userType && rate.rateKind === kind)
      ?.pricePerHour ?? 0

  const lines: QuoteLine[] = []
  let total = 0

  for (const room of rooms) {
    let hour = startHour
    while (hour < endHour) {
      const kind = rateKindForHour(hour)
      let runEnd = hour
      while (runEnd < endHour && rateKindForHour(runEnd) === kind) runEnd += 1
      const pricePerHour = priceFor(room.id, kind)
      const hours = runEnd - hour
      const subtotal = hours * pricePerHour
      total += subtotal
      lines.push({ roomId: room.id, roomName: room.name, rateKind: kind, hours, pricePerHour, subtotal })
      hour = runEnd
    }
  }

  return { total, lines }
}