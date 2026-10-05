import { useEffect, useMemo, useState } from 'react'
import type { Availability, CellState, DayCell, Room, UserType } from '../../shared/types'
import { ApiError, createBooking, getAvailability, getRooms } from '../lib/api'
import type { ConflictInfo, CreateBookingResult, RoomsResponse } from '../lib/api'
import { formatDate, hourLabel, hourRange, todayISODate } from '../lib/format'
import AvailabilityLegend from '../components/AvailabilityLegend'
import BookingConfirmation from '../components/BookingConfirmation'
import BookingForm from '../components/BookingForm'
import BookingGrid, { cellKey } from '../components/BookingGrid'
import type { TimeRange } from '../components/BookingGrid'
import { EmptyPanel, ErrorPanel, LoadingPanel, SelectionBar } from '../components/BookingFeedback'
import QuotePanel, { buildQuote } from '../components/QuotePanel'
import type { QuoteLine } from '../../shared/types'

interface BlockedCell {
  room: Room
  hour: number
  state: CellState
}

/** First occupied cell inside `range` for any of `rooms`; null when the whole range is free. */
function findBlockedCell(rooms: Room[], range: TimeRange, cells: ReadonlyMap<string, DayCell>): BlockedCell | null {
  for (const room of rooms) {
    for (let hour = range.start; hour < range.end; hour += 1) {
      const cell = cells.get(cellKey(room.id, hour))
      if (cell !== undefined && cell.state !== 'free') return { room, hour, state: cell.state }
    }
  }
  return null
}

function blockedNotice(block: BlockedCell): string {
  const reason = block.state === 'approved' ? 'มีการจองแล้ว (พักแล้ว)' : 'มีผู้ขอจองอยู่'
  return `เลือกช่วงเวลานี้ไม่ได้ เนื่องจากห้อง${block.room.name} ${reason} ช่วง ${hourLabel(block.hour)} กรุณาเลือกช่วงเวลาอื่น`
}

/** "Spark 1 (10:00-12:00 น.) · E-III (11:00 น.)" for a 409 payload. */
function describeConflicts(conflicts: ConflictInfo[], rooms: Room[]): string {
  const byRoom = new Map<string, number[]>()
  for (const conflict of conflicts) {
    byRoom.set(conflict.roomId, [...(byRoom.get(conflict.roomId) ?? []), conflict.hour])
  }
  return [...byRoom.entries()]
    .map(([roomId, hours]) => {
      const name = rooms.find((room) => room.id === roomId)?.name ?? roomId
      const sorted = [...hours].sort((a, b) => a - b)
      const parts: string[] = []
      let start = sorted[0]
      let last = sorted[0]
      for (const hour of sorted) {
        if (hour === last + 1) {
          last = hour
          continue
        }
        parts.push(hourRange(start, last + 1))
        start = hour
        last = hour
      }
      parts.push(hourRange(start, last + 1))
      return `${name} ${parts.join(', ')}`
    })
    .join(' · ')
}

export default function BookingPage() {
  const [today] = useState(todayISODate)
  const [date, setDate] = useState(today)
  const [roomsInfo, setRoomsInfo] = useState<RoomsResponse | null>(null)
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsReloadKey, setRoomsReloadKey] = useState(0)
  const [roomsError, setRoomsError] = useState('')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [availLoading, setAvailLoading] = useState(false)
  const [availError, setAvailError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [range, setRange] = useState<TimeRange | null>(null)
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [userType, setUserType] = useState<UserType>('internal')
  const [attendees, setAttendees] = useState(1)
  const [purpose, setPurpose] = useState('')
  const [notice, setNotice] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [created, setCreated] = useState<CreateBookingResult | null>(null)
  const [submittedRange, setSubmittedRange] = useState<TimeRange | null>(null)

  useEffect(() => {
    let active = true
    setRoomsLoading(true)
    setRoomsError('')
    getRooms()
      .then(
        (response) => {
          if (!active) return
          setRoomsInfo(response)
        },
        (error: unknown) => {
          if (!active) return
          setRoomsError(
            error instanceof ApiError ? error.message : 'โหลดข้อมูลห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
          )
        },
      )
      .finally(() => {
        if (active) setRoomsLoading(false)
      })
    return () => {
      active = false
    }
  }, [roomsReloadKey])

  useEffect(() => {
    let active = true
    setAvailLoading(true)
    setAvailError('')
    getAvailability(date)
      .then((response) => {
        if (active) setAvailability(response)
      })
      .catch((error: unknown) => {
        if (active) setAvailability(null)
        if (active) setAvailError(error instanceof ApiError ? error.message : 'โหลดตารางความว่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      })
      .finally(() => {
        if (active) setAvailLoading(false)
      })
    return () => {
      active = false
    }
  }, [date, reloadKey])

  const rooms = useMemo(
    () => [...(roomsInfo?.rooms ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [roomsInfo],
  )
  const openStart = availability?.openStart ?? roomsInfo?.openStart ?? 8
  const openEnd = availability?.openEnd ?? roomsInfo?.openEnd ?? 20
  const hours = useMemo(
    () => Array.from({ length: Math.max(0, openEnd - openStart) }, (_, index) => openStart + index),
    [openStart, openEnd],
  )
  const cells = useMemo(
    () =>
      new Map<string, DayCell>(
        (availability?.cells ?? []).map((cell): [string, DayCell] => [cellKey(cell.roomId, cell.hour), cell]),
      ),
    [availability],
  )
  const freeCellCount = useMemo(() => {
    let count = 0
    for (const cell of availability?.cells ?? []) if (cell.state === 'free') count += 1
    return count
  }, [availability])

  const selectedRooms = useMemo(
    () => rooms.filter((room) => selectedRoomIds.includes(room.id)),
    [rooms, selectedRoomIds],
  )
  const sparkRooms = useMemo(() => rooms.filter((room) => /^spark/i.test(room.name)), [rooms])
  const maxAttendees =
    selectedRooms.length > 0
      ? Math.min(...selectedRooms.map((room) => room.capacityMax))
      : rooms.length > 0
        ? Math.min(...rooms.map((room) => room.capacityMax))
        : 0

  const lines: QuoteLine[] = useMemo(() => {
    if (range === null || selectedRooms.length === 0) return []
    return buildQuote({
      rooms: selectedRooms,
      rates: roomsInfo?.rates ?? [],
      userType,
      startHour: range.start,
      endHour: range.end,
    })
  }, [range, selectedRooms, roomsInfo, userType])

  function resetSelection() {
    setRange(null)
    setSelectedRoomIds([])
    setNotice('')
  }

  function changeDate(next: string) {
    setDate(next)
    setCreated(null)
    setSubmittedRange(null)
    setSubmitError('')
    resetSelection()
  }

  function handleCellClick(roomId: string, hour: number) {
    const cell = cells.get(cellKey(roomId, hour))
    if (cell === undefined || cell.state !== 'free') return
    setNotice('')
    setSubmitError('')

    if (range === null) {
      setRange({ start: hour, end: hour + 1 })
      setSelectedRoomIds((previous) => (previous.includes(roomId) ? previous : [...previous, roomId]))
      return
    }

    if (hour === range.start) {
      resetSelection()
      return
    }

    const next: TimeRange = { start: Math.min(range.start, hour), end: Math.max(range.end, hour + 1) }
    const room = rooms.find((entry) => entry.id === roomId)
    const involved = room === undefined ? selectedRooms : [...selectedRooms.filter((entry) => entry.id !== roomId), room]
    const block = findBlockedCell(involved, next, cells)
    if (block !== null) {
      setNotice(blockedNotice(block))
      return
    }

    setRange(next)
    if (room !== undefined && !selectedRoomIds.includes(roomId)) setSelectedRoomIds([...selectedRoomIds, roomId])
  }

  function handleToggleRoom(roomId: string) {
    setNotice('')
    const room = rooms.find((entry) => entry.id === roomId)
    if (room === undefined) return

    if (range !== null) {
      const block = findBlockedCell([room], range, cells)
      if (block !== null) {
        setNotice(blockedNotice(block))
        return
      }
    }

    setSelectedRoomIds((previous) =>
      previous.includes(roomId) ? previous.filter((id) => id !== roomId) : [...previous, roomId],
    )
  }

  function handleSelectSparkTogether() {
    setNotice('')
    if (range === null) {
      setNotice('กรุณาเลือกช่วงเวลาจากตารางก่อน แล้วจึงเลือกห้อง Spark 1-3 พร้อมกัน')
      return
    }

    const block = findBlockedCell(sparkRooms, range, cells)
    if (block !== null) {
      setNotice(blockedNotice(block))
      return
    }

    setSelectedRoomIds((previous) => [...new Set([...previous, ...sparkRooms.map((room) => room.id)])])
  }

  async function handleSubmit() {
    if (range === null || selectedRoomIds.length === 0 || submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await createBooking({
        activityDate: date,
        startHour: range.start,
        endHour: range.end,
        roomIds: selectedRoomIds,
        userType,
        attendees,
        purpose: purpose.trim(),
      })
      setCreated(result)
      setSubmittedRange(range)
      setReloadKey((key) => key + 1)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        const detail =
          error.status === 409 && error.conflicts.length > 0
            ? ` ห้อง/ช่วงเวลาที่ชน: ${describeConflicts(error.conflicts, rooms)}`
            : ''
        setSubmitError(`${error.message}${detail}`)
        if (error.status === 409) setReloadKey((key) => key + 1)
      } else {
        setSubmitError('เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartNew() {
    setCreated(null)
    setSubmittedRange(null)
    resetSelection()
    setPurpose('')
    setAttendees(1)
    setReloadKey((key) => key + 1)
  }

  const canSubmit =
    range !== null &&
    selectedRoomIds.length > 0 &&
    attendees >= 1 &&
    attendees <= maxAttendees &&
    purpose.trim().length > 0 &&
    created === null

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">จองห้อง</h1>
          <p className="mt-1 text-sm text-slate-600">
            เลือกช่วงเวลาที่ต้องการจากตาราง แล้วเลือกห้องที่จะใช้งาน
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="booking-date" className="mb-1 block text-sm font-medium text-slate-700">
              วันที่ใช้ห้อง
            </label>
            <input
              id="booking-date"
              type="date"
              value={date}
              min={today}
              onChange={(event) => changeDate(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => changeDate(today)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            วันนี้
          </button>
        </div>
      </header>

      <p className="mt-2 text-sm text-slate-600">
        วันที่เลือก: <span className="font-medium text-slate-900">{formatDate(date)}</span>
      </p>

      {created !== null && submittedRange !== null && (
        <div className="mt-4">
          <BookingConfirmation
            result={created}
            date={date}
            roomNames={selectedRooms.map((room) => room.name)}
            startHour={submittedRange.start}
            endHour={submittedRange.end}
            onStartNew={handleStartNew}
          />
        </div>
      )}

      {created === null && (
        <>
          <div className="mt-4 space-y-3">
            {roomsError !== '' && (
              <ErrorPanel message={roomsError} onRetry={() => setRoomsReloadKey((key) => key + 1)} />
            )}
            {availError !== '' && (
              <ErrorPanel message={availError} onRetry={() => setReloadKey((key) => key + 1)} />
            )}
          </div>

          <div className="mt-4 space-y-3">
            <AvailabilityLegend />
            {notice !== '' && (
              <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {notice}
              </p>
            )}

            {roomsError === '' && roomsLoading && <LoadingPanel message="กำลังโหลดข้อมูลห้อง…" />}

            {roomsError === '' && !roomsLoading && rooms.length === 0 && (
              <EmptyPanel message="ยังไม่มีข้อมูลห้องในระบบ กรุณาติดต่อผู้ดูแลระบบ" />
            )}

            {roomsError === '' && rooms.length > 0 && availLoading && availability === null && (
              <LoadingPanel message="กำลังโหลดตารางความว่างของห้อง…" />
            )}

            {roomsError === '' && rooms.length > 0 && availError === '' && !availLoading && (
              <>
                <BookingGrid
                  rooms={rooms}
                  hours={hours}
                  cells={cells}
                  selectedRooms={selectedRoomIds}
                  range={range}
                  onCellClick={handleCellClick}
                  onToggleRoom={handleToggleRoom}
                />
                <SelectionBar
                  range={range}
                  roomNames={selectedRooms.map((room) => room.name)}
                  date={date}
                  onClear={resetSelection}
                />
                {freeCellCount === 0 && (
                  <EmptyPanel
                    message={`วันที่ ${formatDate(date)} ไม่มีช่วงเวลาว่างเลย กรุณาเลือกวันที่อื่นหรือติดต่อผู้ดูแลระบบ`}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSelectSparkTogether}
                    disabled={sparkRooms.length === 0}
                    className="rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                  >
                    เลือก Spark 1-3 พร้อมกัน
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <QuotePanel
              lines={lines}
              emptyHint="เลือกช่วงเวลาจากตารางและเลือกห้องที่ต้องการ เพื่อดูค่าใช้จ่ายโดยประมาณ"
            />
            <BookingForm
              userType={userType}
              attendees={attendees}
              purpose={purpose}
              maxAttendees={maxAttendees}
              submitting={submitting}
              canSubmit={canSubmit}
              errorMessage={submitError}
              onUserTypeChange={setUserType}
              onAttendeesChange={setAttendees}
              onPurposeChange={setPurpose}
              onSubmit={handleSubmit}
            />
          </div>
        </>
      )}
    </div>
  )
}
