import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@voxora/contracts';
import { HomePage } from './pages/HomePage';
import { JoinSessionPage } from './pages/JoinSessionPage';
import { ConversationPage } from './features/conversation/ConversationPage';
import { MicrophoneDevPanel } from './features/audio/microphone-dev-panel';
import type { AppPage } from './types';
import './styles.css';

function App() {
  const [page, setPage] = useState<AppPage>('home');
  const [session, setSession] = useState<Session | null>(null);

  if (page === 'join') {
    return <JoinSessionPage onBack={() => setPage('home')} onJoined={(nextSession) => { setSession(nextSession); setPage('conversation'); }} />;
  }

  if (page === 'conversation' && session) {
    return <ConversationPage session={session} onLeave={() => { setSession(null); setPage('home'); }} />;
  }

  return (
    <>
      <HomePage onJoin={() => setPage('join')} />
      {import.meta.env.DEV && <MicrophoneDevPanel />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
