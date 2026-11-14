import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { OverviewPage } from '@/pages/OverviewPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ProjectDetailPage } from '@/pages/ProjectDetailPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { TasksPage } from '@/pages/TasksPage'
import { CommercialPage } from '@/pages/CommercialPage'
import { SettingsPage } from '@/pages/SettingsPage'

// One app, one layout. Only the middle part changes when you click the sidebar (client-side navigation).
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="commercial" element={<CommercialPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<OverviewPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
