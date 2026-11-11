export type ProviderErrorCode =
  | 'PROVIDER_CONFIG_INVALID'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_SESSION_CLOSED'
  | 'UNSUPPORTED_LANGUAGE';

export class TranslationProviderError extends Error {
  public constructor(
    public readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TranslationProviderError';
  }
}
