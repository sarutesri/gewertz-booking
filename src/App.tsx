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
  `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-sky-700 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`

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
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="mr-auto">
            <p className="text-base font-semibold leading-tight text-slate-900">ระบบจองห้อง GEWERTZ SQUARE</p>
            <p className="text-xs text-slate-500">คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</p>
          </div>

          <nav className="flex flex-wrap items-center gap-1" aria-label="เมนูหลัก">
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

          <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-slate-800">{me.name}</p>
              <p className="text-xs text-slate-500">{me.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
        {signOutError && (
          <p role="alert" className="bg-rose-50 px-4 py-2 text-center text-sm text-rose-700">
            {signOutError}
          </p>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500">
        ระบบจองห้องประชุม GEWERTZ SQUARE — หากพบปัญหาในการจอง กรุณาติดต่อผู้ดูแลระบบ
      </footer>
    </div>
  )
}

function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span
          role="status"
          aria-label="กำลังโหลด"
          className="size-8 animate-spin rounded-full border-4 border-slate-300 border-t-sky-700"
        />
        <p className="text-sm text-slate-600">กำลังตรวจสอบสถานะการเข้าสู่ระบบ…</p>
      </div>
    </div>
  )
}