import type { Session, SessionStatus } from '@voxora/contracts';

export type AppPage = 'home' | 'join' | 'conversation' | 'admin' | 'login' | 'user';
export type UiSessionStatus = SessionStatus | 'muted' | 'error';

export interface Caption {
  id: string;
  speakerName: string;
  language: string;
  text: string;
  final: boolean;
  direction: 'source' | 'translated';
}

export interface JoinResult {
  session: Session;
  isMock: boolean;
}

