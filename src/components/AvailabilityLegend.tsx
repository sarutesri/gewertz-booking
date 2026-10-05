const ITEMS = [
  { swatch: 'border-slate-200 bg-white', label: 'ว่าง — คลิกเพื่อเลือก' },
  { swatch: 'border-brand-600 bg-brand-600', label: 'ที่คุณเลือกไว้' },
  { swatch: 'border-slate-100 bg-slate-100', label: 'เลยเวลาแล้ว — เลือกไม่ได้' },
  { swatch: 'border-transparent bg-slate-300', label: 'พักแล้ว (จองแล้ว)' },
  { swatch: 'border-transparent bg-amber-200', label: 'มีผู้ขอจอง' },
  { swatch: 'border-sky-400 bg-slate-300 ring-2 ring-sky-400', label: 'เป็นการจองของคุณ' },
]

export default function AvailabilityLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-700">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className={`inline-block size-5 shrink-0 rounded border ${item.swatch}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}