import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Overlays } from './components/ui'
import { useSettings } from './lib/hooks'
import { configureLogger } from './lib/logger'
import { Dashboard } from './pages/Dashboard'
import { Logs } from './pages/Logs'
import { NoteDetail } from './pages/NoteDetail'
import { Notes } from './pages/Notes'
import { PageEditor } from './pages/PageEditor'
import { Review } from './pages/Review'
import { SettingsPage } from './pages/Settings'
import { Stats } from './pages/Stats'
import { StreakPage } from './pages/Streak'

export default function App() {
  const settings = useSettings()
  useEffect(() => {
    if (settings.theme === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])
  useEffect(() => configureLogger({ level: settings.logLevel, maxLogs: settings.maxLogs }), [settings.logLevel, settings.maxLogs])

  return (
    <Overlays>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="notes" element={<Notes />} />
          <Route path="notes/:noteId" element={<NoteDetail />} />
          <Route path="notes/:noteId/page/:pageId" element={<PageEditor />} />
          <Route path="review" element={<Review />} />
          <Route path="stats" element={<Stats />} />
          <Route path="streak" element={<StreakPage />} />
          <Route path="logs" element={<Logs />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Overlays>
  )
}
