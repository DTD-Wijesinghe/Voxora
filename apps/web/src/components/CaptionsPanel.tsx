import type { Caption } from '../types';

interface CaptionsPanelProps { captions: Caption[]; }

export function CaptionsPanel({ captions }: CaptionsPanelProps) {
  return <section className="captions-panel" aria-labelledby="captions-title"><div className="section-heading"><div><span className="eyebrow">Conversation feed</span><h2 id="captions-title">Live captions</h2></div><span className="live-indicator">● LIVE</span></div>{captions.length === 0 ? <div className="empty-state"><span className="empty-state__icon">✦</span><p>Captions will appear here when the conversation starts.</p></div> : <div className="caption-list" aria-live="polite">{captions.map((caption) => <article className={`caption caption--${caption.direction}`} key={caption.id}><div className="caption__meta"><strong>{caption.speakerName}</strong><span>{caption.language}{caption.final ? '' : ' · interim'}</span></div><p>{caption.text}</p></article>)}</div>}</section>;
}

