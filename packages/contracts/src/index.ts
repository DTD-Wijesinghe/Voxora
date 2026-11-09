export type LanguageCode = string;

export type SessionStatus = 'connecting' | 'live' | 'reconnecting' | 'ended';

export interface Participant {
  id: string;
  displayName: string;
  targetLanguage: LanguageCode;
  isHost: boolean;
}

export interface Session {
  id: string;
  joinCode: string;
  status: SessionStatus;
  participants: Participant[];
  expiresAt: string;
}

export interface CreateSessionRequest {
  displayName: string;
  targetLanguage: LanguageCode;
}

export interface TranslationProvider {
  start(input: {
    targetLanguage: LanguageCode;
    onEvent: (event: TranslationEvent) => void;
  }): Promise<{ sendAudio: (pcm16: ArrayBuffer) => Promise<void>; close: () => Promise<void> }>;
}

export type TranslationEvent =
  | { type: 'input_transcript'; text: string; final: boolean }
  | { type: 'output_transcript'; text: string; final: boolean }
  | { type: 'audio'; pcm16: ArrayBuffer; sequence: number }
  | { type: 'status'; status: SessionStatus }
  | { type: 'error'; code: string; message: string };

