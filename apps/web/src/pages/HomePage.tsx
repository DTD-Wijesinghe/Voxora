import { BrandMark } from '../components/BrandMark';

interface HomePageProps {
  onJoin: () => void;
  onLogin: () => void;
}

export function HomePage({ onJoin, onLogin }: HomePageProps) {
  return (
    <div className="marketing-shell">
      <header className="topbar">
        <BrandMark />
        <span className="topbar__tag">Live translation, made human</span>
        <button className="button button--ghost button--small" type="button" onClick={onLogin}>Login</button>
        <button className="button button--ghost topbar__action" type="button" onClick={onJoin}>Join a session</button>
      </header>
      <main className="hero">
        <div className="hero__copy">
          <div className="hero__kicker"><span className="sparkle">✦</span> Speak freely. Understand instantly.</div>
          <h1>Conversations that <em>cross</em> every language.</h1>
          <p>Voxora turns natural speech into a live, translated conversation - so people can connect without stopping to type, translate, or repeat.</p>
          <button className="button button--primary button--large" type="button" onClick={onJoin}>Start a conversation <span aria-hidden="true">→</span></button>
          <div className="hero__note"><span className="secure-icon">◈</span> Private by design. No audio stored by default.</div>
        </div>
        <div className="hero__badge-stage">
          <img className="hero__badge" src="/voxora-logo.png" alt="Voxora - Live Voice Translation" />
        </div>
      </main>
      <footer className="landing-footer"><span>Built for meaningful conversations</span><span>Two voices. One understanding.</span></footer>
    </div>
  );
}
