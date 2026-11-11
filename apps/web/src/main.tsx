import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@voxora/contracts';
import { HomePage } from './pages/HomePage';
import { JoinSessionPage } from './pages/JoinSessionPage';
import { ConversationPage } from './features/conversation/ConversationPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { LoginPage } from './pages/LoginPage';
import { UserDashboard } from './pages/UserDashboard';
import { ThemeToggle } from './components/ThemeToggle';
import { logout, type AuthSession } from './lib/api';
import type { AppPage } from './types';
import './styles.css';

// Determine initial page and prefill code from the URL
const params = new URLSearchParams(window.location.search);
const initialCode = params.get('code') ?? undefined;
const initialPage: AppPage = window.location.pathname === '/admin'
  ? 'login'
  : initialCode
    ? 'join'
    : 'home';

function RoutedApp() {
  const [page, setPage] = useState<AppPage>(initialPage);
  const [session, setSession] = useState<Session | null>(null);
  const [conversationRole, setConversationRole] = useState<'organizer' | 'attendee' | null>(null);
  const [auth, setAuth] = useState<AuthSession | null>(null);

  function signOut() {
    if (auth) void logout(auth.token).catch(() => undefined);
    setAuth(null);
    setSession(null);
    setConversationRole(null);
    setPage('home');
  }

  if (page === 'login') {
    return <LoginPage onBack={() => setPage('home')} onAuthenticated={(nextAuth) => { setAuth(nextAuth); setPage(nextAuth.user.role === 'admin' ? 'admin' : 'user'); }} />;
  }

  if (page === 'admin' && auth?.user.role === 'admin') {
    return <AdminDashboard authToken={auth.token} onBack={() => setPage('home')} onLogout={signOut} onOpenSession={(adminSession) => { setSession(adminSession); setConversationRole('organizer'); setPage('conversation'); }} />;
  }

  if (page === 'user' && auth?.user.role === 'user') {
    return <UserDashboard displayName={auth.user.displayName} onJoin={() => setPage('join')} onLogout={signOut} />;
  }

  if (page === 'join') {
    return <JoinSessionPage prefillCode={initialCode} onBack={() => setPage('home')} onJoined={(nextSession) => { setSession(nextSession); setConversationRole('attendee'); setPage('conversation'); }} />;
  }

  if (page === 'conversation' && session) {
    return <ConversationPage session={session} role={conversationRole ?? 'attendee'} onLeave={() => { setSession(null); setConversationRole(null); setPage('home'); }} />;
  }

  return (
    <>
      <HomePage onJoin={() => setPage('join')} onLogin={() => setPage('login')} />
    </>
  );
}

function App() {
  return <><RoutedApp /><ThemeToggle /></>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
