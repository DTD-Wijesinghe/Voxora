import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@voxora/contracts';
import { HomePage } from './pages/HomePage';
import { JoinSessionPage } from './pages/JoinSessionPage';
import { ConversationPage } from './features/conversation/ConversationPage';
import { AdminDashboard } from './pages/AdminDashboard';
import type { AppPage } from './types';
import './styles.css';

// Determine initial page and prefill code from the URL
const params = new URLSearchParams(window.location.search);
const initialCode = params.get('code') ?? undefined;
const initialPage: AppPage = window.location.pathname === '/admin'
  ? 'admin'
  : initialCode
    ? 'join'
    : 'home';

function App() {
  const [page, setPage] = useState<AppPage>(initialPage);
  const [session, setSession] = useState<Session | null>(null);

  if (page === 'admin') {
    return <AdminDashboard onBack={() => setPage('home')} />;
  }

  if (page === 'join') {
    return <JoinSessionPage prefillCode={initialCode} onBack={() => setPage('home')} onJoined={(nextSession) => { setSession(nextSession); setPage('conversation'); }} />;
  }

  if (page === 'conversation' && session) {
    return <ConversationPage session={session} onLeave={() => { setSession(null); setPage('home'); }} />;
  }

  return <HomePage onJoin={() => setPage('join')} onAdmin={() => setPage('admin')} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
