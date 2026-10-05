import { useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { ApiError } from './lib/api'
import { AuthProvider, useAuth } from './components/AuthProvider'
import AdminPage from './pages/AdminPage'
import BookingPage from './pages/BookingPage'
import LoginPage from './pages/LoginPage'
import MyBookingsPage from './pages/MyBookingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<BookingPage />} />
              <Route path="/my-bookings" element={<MyBookingsPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

/** Nothing renders before the session cookie has been resolved, on any route. */
function PublicOnly() {
  const { ready } = useAuth()
  if (!ready) return <SplashScreen />
  return <Outlet />
}

function RequireAuth() {
  const { me, ready } = useAuth()
  if (!ready) return <SplashScreen />
  if (!me) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireAdmin() {
  const { me } = useAuth()
  if (me?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }): string =>
  `rounded-full px-5 py-3 text-base font-medium transition focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
    isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`

const SIGN_OUT_CLASS =
  'min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-2 text-base font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-brand-600 focus-visible:ring-offset-2'

function AppShell() {
  const { me, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    setSignOutError('')
    try {
      await signOut()
    } catch (error) {
      setSignOutError(error instanceof ApiError ? error.message : 'ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  if (!me) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-4 px-4 py-5 sm:px-8">
          <div className="mr-auto flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-base font-semibold tracking-tight text-white"
            >
              GWS
            </span>
            <div>
              <p className="text-lg font-semibold leading-tight text-slate-900">ระบบจองห้อง GEWERTZ SQUARE</p>
              <p className="text-sm text-slate-600">คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2" aria-label="เมนูหลัก">
            <NavLink to="/" end className={NAV_LINK_CLASS}>
              จองห้อง
            </NavLink>
            <NavLink to="/my-bookings" className={NAV_LINK_CLASS}>
              การจองของฉัน
            </NavLink>
            {me.role === 'admin' && (
              <NavLink to="/admin" className={NAV_LINK_CLASS}>
                ผู้ดูแลระบบ
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-4 border-l border-slate-200 pl-6">
            <div className="text-right leading-tight">
              <p className="text-base font-medium text-slate-900">{me.name}</p>
              <p className="text-sm text-slate-600">{me.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'}</p>
            </div>
            <button type="button" onClick={handleSignOut} className={SIGN_OUT_CLASS}>
              ออกจากระบบ
            </button>
          </div>
        </div>
        {signOutError && (
          <p role="alert" className="bg-rose-50 px-4 py-3 text-center text-base text-rose-800">
            {signOutError}
          </p>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
        ระบบจองห้องประชุม GEWERTZ SQUARE — หากพบปัญหาในการจอง กรุณาติดต่อผู้ดูแลระบบ
      </footer>
    </div>
  )
}

function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <span
          role="status"
          aria-label="กำลังโหลด"
          className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600"
        />
        <p className="text-base text-slate-700">กำลังตรวจสอบสถานะการเข้าสู่ระบบ…</p>
      </div>
    </div>
  )
}