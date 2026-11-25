import { NavLink, Outlet } from 'react-router-dom'
import { AiBanner } from './AiPanel'
import { Icon, type IconName } from './Icon'

const LINKS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Hôm nay', icon: 'home', end: true },
  { to: '/notes', label: 'Ghi chú', icon: 'notes' },
  { to: '/stats', label: 'Thống kê', icon: 'chart' },
  { to: '/streak', label: 'Chuỗi', icon: 'flame' },
  { to: '/logs', label: 'Nhật ký', icon: 'list' },
  { to: '/settings', label: 'Cài đặt', icon: 'gear' },
]

export function Layout() {
  return (
    <div className="app">
      <nav className="nav" aria-label="Điều hướng chính">
        <div className="brand">
          <img src="./icon.svg" alt="" />
          InkRecall
        </div>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={l.icon} />
            <span>{l.label}</span>
          </NavLink>
        ))}
        <div className="nav-spacer" />
      </nav>
      <main className="main">
        <AiBanner />
        <Outlet />
      </main>
    </div>
  )
}
