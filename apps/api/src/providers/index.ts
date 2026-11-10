import type { TranslationProvider } from '@voxora/contracts';
import { TranslationProviderError } from './errors.js';
import { createMockTranslationProvider } from './mock-provider.js';

export { TranslationProviderError } from './errors.js';
export type { ProviderErrorCode } from './errors.js';

/**
 * Single entry point for the rest of the backend. Callers receive a
 * provider-neutral TranslationProvider and never import Gemini code directly.
 */
export function createTranslationProvider(
  env: NodeJS.ProcessEnv = process.env,
): TranslationProvider {
  const provider = env.TRANSLATION_PROVIDER ?? 'mock';

  switch (provider) {
    case 'mock':
      return createMockTranslationProvider();
    case 'gemini':
      throw new TranslationProviderError(
        'PROVIDER_CONFIG_INVALID',
        'The Gemini provider is not implemented yet. Set TRANSLATION_PROVIDER=mock.',
      );
    default:
      throw new TranslationProviderError(
        'PROVIDER_CONFIG_INVALID',
        `Unknown TRANSLATION_PROVIDER "${provider}". Use "mock" or "gemini".`,
      );
  }
}
