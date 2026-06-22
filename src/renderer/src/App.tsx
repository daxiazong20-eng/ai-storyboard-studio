import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { HomePage } from '../pages/HomePage';
import { ProjectPage } from '../pages/ProjectPage';
import { StoryModePage } from '../pages/StoryModePage';
import { SettingsPage } from '../pages/SettingsPage';
import { useStudioStore } from '../stores/studioStore';

export function App() {
  const initialize = useStudioStore((state) => state.initialize);
  useEffect(() => { void initialize(); }, [initialize]);
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/project/:projectId" element={<ProjectPage />} />
    <Route path="/story/:projectId" element={<StoryModePage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
