import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError, login, register } from '../lib/api'
import type { Me } from '../../shared/types'
import { useAuth } from '../components/AuthProvider'

type Mode = 'signin' | 'signup'

interface FieldErrors {
  name?: string
  email?: string
  password?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const { me, setMe } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (me) return <Navigate to="/" replace />

  function switchMode(next: Mode) {
    setMode(next)
    setFieldErrors({})
    setFormError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const errors: FieldErrors = {}
    if (mode === 'signup' && name.trim().length === 0) errors.name = 'กรุณากรอกชื่อ-นามสกุล'
    if (email.trim().length === 0) errors.email = 'กรุณากรอกอีเมล'
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'รูปแบบอีเมลไม่ถูกต้อง'
    if (password.length < 8) errors.password = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
    if (password.length > 200) errors.password = 'รหัสผ่านยาวเกินไป'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setFormError('')
    try {
      const user: Me =
        mode === 'signin'
          ? await login(email.trim(), password)
          : await register(name.trim(), email.trim(), password)
      setMe(user)
      navigate('/', { replace: true })
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const registering = mode === 'signup'
  const submitLabel = submitting ? 'กำลังดำเนินการ…' : registering ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-semibold tracking-tight text-white"
          >
            GWS
          </span>
          <h1 className="text-3xl font-semibold text-slate-900">ระบบจองห้อง</h1>
          <p className="mt-2 text-base text-slate-700">GEWERTZ SQUARE คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              aria-pressed={!registering}
              className={`min-h-12 rounded-lg px-4 py-3 text-base font-medium transition focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
                registering
                  ? 'text-slate-700 hover:bg-white/60'
                  : 'bg-brand-600 text-white shadow-sm'
              }`}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              aria-pressed={registering}
              className={`min-h-12 rounded-lg px-4 py-3 text-base font-medium transition focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
                registering
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-white/60'
              }`}
            >
              สมัครใช้งาน
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {registering && (
              <label className="block">
                <span className="mb-2 block text-base font-medium text-slate-700">ชื่อ-นามสกุล</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  className={inputClass(fieldErrors.name !== undefined)}
                />
                {fieldErrors.name && <p className="mt-2 text-sm text-rose-700">{fieldErrors.name}</p>}
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-base font-medium text-slate-700">อีเมล</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={200}
                className={inputClass(fieldErrors.email !== undefined)}
              />
              {fieldErrors.email && <p className="mt-2 text-sm text-rose-700">{fieldErrors.email}</p>}
            </label>

            <label className="block">
              <span className="mb-2 block text-base font-medium text-slate-700">รหัสผ่าน</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={registering ? 'new-password' : 'current-password'}
                maxLength={200}
                className={inputClass(fieldErrors.password !== undefined)}
              />
              {fieldErrors.password ? (
                <p className="mt-2 text-sm text-rose-700">{fieldErrors.password}</p>
              ) : (
                <p className="mt-2 text-sm text-slate-600">รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร</p>
              )}
            </label>

            {formError && (
              <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-base text-rose-800">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-12 rounded-xl bg-brand-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {registering
              ? 'มีบัญชีอยู่แล้ว? กด "เข้าสู่ระบบ" ด้านบนเพื่อเข้าใช้งาน'
              : 'ยังไม่มีบัญชี? เลือก "สมัครใช้งาน" ด้านบนเพื่อสร้างบัญชีใหม่'}
          </p>
        </div>
      </div>
    </div>
  )
}

function inputClass(invalid: boolean): string {
  return `w-full min-h-12 rounded-xl border px-4 py-3 text-base outline-none transition focus:ring-2 ${
    invalid
      ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-200'
      : 'border-slate-300 bg-white focus:border-brand-600 focus:ring-brand-200'
  }`
}