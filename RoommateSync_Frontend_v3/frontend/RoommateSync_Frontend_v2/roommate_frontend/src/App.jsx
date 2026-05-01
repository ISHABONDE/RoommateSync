import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import Layout from './components/Layout'
import { PageLoader } from './components/Shared'

const Login       = lazy(() => import('./pages/Login'))
const Register    = lazy(() => import('./pages/Register'))
const VerifyOtp   = lazy(() => import('./pages/VerifyOtp'))
const Home        = lazy(() => import('./pages/Home'))
const Matches     = lazy(() => import('./pages/Matches'))
const Discover    = lazy(() => import('./pages/Discover'))
const Rooms       = lazy(() => import('./pages/Rooms'))
const Chat        = lazy(() => import('./pages/Chat'))
const Profile     = lazy(() => import('./pages/Profile'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const Admin       = lazy(() => import('./pages/Admin'))

function ProtectedLayout() {
  const { user, loading, token } = useAuth()
  if (loading) return <PageLoader />
  if (!user)   return <Navigate to="/login" replace />
  return (
    <SocketProvider token={token}>
      <Layout>
        <Outlet />
      </Layout>
    </SocketProvider>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login"      element={<Login />} />
        <Route path="/register"   element={<Register />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/"          element={<Home />} />
          <Route path="/matches"   element={<Matches />} />
          <Route path="/discover"  element={<Discover />} />
          <Route path="/rooms"     element={<Rooms />} />
          <Route path="/rooms/:id" element={<Rooms />} />
          <Route path="/chat"      element={<Chat />} />
          <Route path="/profile"   element={<Profile />} />
          <Route path="/user/:id"  element={<UserProfile />} />
          <Route path="/admin"      element={<Admin />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              borderRadius: 10,
              border: '1px solid rgba(28,25,23,0.1)',
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  )
}
