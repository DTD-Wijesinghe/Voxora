import type { Participant } from '@voxora/contracts';
import { languageLabel } from '../lib/languages';

interface ParticipantListProps { participants: Participant[]; }

export function ParticipantList({ participants }: ParticipantListProps) {
  return <section className="side-panel__section" aria-labelledby="participants-title"><div className="section-heading"><h2 id="participants-title">Participants</h2><span className="count-badge">{participants.length}</span></div><div className="participant-list">{participants.map((participant) => <div className="participant" key={participant.id}><span className="avatar">{participant.displayName.slice(0, 1).toUpperCase()}</span><span className="participant__details"><strong>{participant.displayName}{participant.isHost ? ' (host)' : ''}</strong><small>{languageLabel(participant.targetLanguage)}</small></span><span className="online-dot" aria-label="Connected" /></div>)}</div></section>;
}

