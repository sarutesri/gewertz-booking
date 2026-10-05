const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' })
const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  hour: '2-digit',
  hour12: false,
})

export interface BangkokClock {
  /** YYYY-MM-DD in Bangkok local time. */
  date: string
  /** Whole hour 0-23 in Bangkok local time. */
  hour: number
}

export function bangkokNow(at: Date = new Date()): BangkokClock {
  return { date: dateFormatter.format(at), hour: Number(hourFormatter.format(at)) }
}