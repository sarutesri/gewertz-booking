const ITEMS = [
  { swatch: 'border-slate-200 bg-white', label: 'ว่าง — คลิกเพื่อเลือก' },
  { swatch: 'border-emerald-600 bg-emerald-600', label: 'ที่คุณเลือกไว้' },
  { swatch: 'border-transparent bg-slate-300', label: 'พักแล้ว (จองแล้ว)' },
  { swatch: 'border-transparent bg-amber-200', label: 'มีผู้ขอจอง' },
  { swatch: 'border-sky-400 bg-slate-300 ring-2 ring-sky-400', label: 'เป็นการจองของคุณ' },
]

export default function AvailabilityLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`inline-block size-4 rounded border ${item.swatch}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}