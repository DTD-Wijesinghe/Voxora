export type MicrophoneErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'no-microphone'
  | 'unavailable'
  | 'unknown';

export class MicrophoneError extends Error {
  public readonly code: MicrophoneErrorCode;

  public constructor(code: MicrophoneErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'MicrophoneError';
    this.code = code;

    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface MicrophoneConstraints {
  audio: {
    channelCount: 1;
    echoCancellation: true;
    noiseSuppression: true;
    autoGainControl: true;
  };
}

const MICROPHONE_CONSTRAINTS: MicrophoneConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

function isActiveStream(stream: MediaStream): boolean {
  return stream.getAudioTracks().some((track) => track.readyState === 'live');
}

function getErrorDetails(error: unknown): { code: MicrophoneErrorCode; message: string } {
  if (!(error instanceof DOMException)) {
    return {
      code: 'unknown',
      message: 'Unable to access the microphone.',
    };
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        code: 'permission-denied',
        message: 'Microphone permission was denied. Allow microphone access and try again.',
      };
    case 'NotFoundError':
      return {
        code: 'no-microphone',
        message: 'No microphone was found. Connect a microphone and try again.',
      };
    case 'NotReadableError':
    case 'AbortError':
    case 'InvalidStateError':
      return {
        code: 'unavailable',
        message: 'The microphone is unavailable. Close other apps using it and try again.',
      };
    default:
      return {
        code: 'unknown',
        message: 'Unable to access the microphone.',
      };
  }
}

export class MicrophoneManager {
  private stream: MediaStream | null = null;
  private pendingStart: Promise<MediaStream> | null = null;
  private requestGeneration = 0;

  public async start(): Promise<MediaStream> {
    if (this.stream !== null && isActiveStream(this.stream)) {
      return this.stream;
    }

    if (this.pendingStart !== null) {
      return this.pendingStart;
    }

    this.releaseStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicrophoneError(
        'unsupported',
        'This browser does not support microphone access.',
      );
    }

    const generation = ++this.requestGeneration;
    this.pendingStart = this.acquireStream(generation);
    return this.pendingStart;
  }

  public stop(): void {
    this.requestGeneration += 1;
    this.releaseStream();
  }

  public mute(): void {
    this.setTracksEnabled(false);
  }

  public unmute(): void {
    this.setTracksEnabled(true);
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  private async acquireStream(generation: number): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);

      if (generation !== this.requestGeneration) {
        this.stopTracks(stream);
        throw new MicrophoneError('unavailable', 'Microphone start was cancelled.');
      }

      if (!isActiveStream(stream)) {
        this.stopTracks(stream);
        throw new MicrophoneError('no-microphone', 'No active microphone was found.');
      }

      this.stream = stream;
      return stream;
    } catch (error: unknown) {
      if (error instanceof MicrophoneError) {
        throw error;
      }

      const details = getErrorDetails(error);
      throw new MicrophoneError(details.code, details.message, error);
    } finally {
      this.pendingStart = null;
    }
  }

  private setTracksEnabled(enabled: boolean): void {
    if (this.stream === null || !isActiveStream(this.stream)) {
      throw new MicrophoneError('unavailable', 'The microphone is not started.');
    }

    for (const track of this.stream.getAudioTracks()) {
      track.enabled = enabled;
    }
  }

  private releaseStream(): void {
    if (this.stream === null) {
      return;
    }

    this.stopTracks(this.stream);
    this.stream = null;
  }

  private stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}
