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
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">ระบบจองห้อง</h1>
          <p className="mt-1 text-sm text-slate-600">GEWERTZ SQUARE คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
        </header>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              aria-pressed={!registering}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                registering ? 'text-slate-600 hover:bg-white/60' : 'bg-white text-slate-900 shadow-sm'
              }`}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              aria-pressed={registering}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                registering ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              สมัครใช้งาน
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {registering && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">ชื่อ-นามสกุล</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  className={inputClass(fieldErrors.name !== undefined)}
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-rose-600">{fieldErrors.name}</p>}
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">อีเมล</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={200}
                className={inputClass(fieldErrors.email !== undefined)}
              />
              {fieldErrors.email && <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">รหัสผ่าน</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={registering ? 'new-password' : 'current-password'}
                maxLength={200}
                className={inputClass(fieldErrors.password !== undefined)}
              />
              {fieldErrors.password ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร</p>
              )}
            </label>

            {formError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLabel}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
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
  return `w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
    invalid
      ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-200'
      : 'border-slate-300 bg-white focus:border-sky-600 focus:ring-sky-200'
  }`
}