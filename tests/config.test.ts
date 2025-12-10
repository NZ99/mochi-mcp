/**
 * Tests for configuration module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateDeleteConfirmation } from '../src/config.js';

describe('loadConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('throws if MOCHI_API_KEY is missing', () => {
        delete process.env.MOCHI_API_KEY;
        expect(() => loadConfig()).toThrow('MOCHI_API_KEY');
    });

    it('loads config with defaults', () => {
        process.env.MOCHI_API_KEY = 'test-key';
        const config = loadConfig();

        expect(config.apiKey).toBe('test-key');
        expect(config.apiBaseUrl).toBe('https://app.mochi.cards/api');
        expect(config.allowDeckDelete).toBe(false);
        expect(config.tokenExpiryMins).toBe(10);
    });

    it('loads custom config from env', () => {
        process.env.MOCHI_API_KEY = 'test-key';
        process.env.MOCHI_ALLOW_DECK_DELETE = 'true';
        process.env.MOCHI_TOKEN_EXPIRY_MINS = '30';

        const config = loadConfig();

        expect(config.allowDeckDelete).toBe(true);
        expect(config.tokenExpiryMins).toBe(30);
    });
});

describe('validateDeleteConfirmation', () => {
    it('validates card deletion confirmation', () => {
        expect(validateDeleteConfirmation('delete card abc123', 'abc123', 'card')).toBe(true);
        expect(validateDeleteConfirmation('DELETE CARD ABC123', 'abc123', 'card')).toBe(true);
        expect(validateDeleteConfirmation('delete card wrong', 'abc123', 'card')).toBe(false);
        expect(validateDeleteConfirmation('remove card abc123', 'abc123', 'card')).toBe(false);
    });

    it('validates deck deletion confirmation', () => {
        expect(validateDeleteConfirmation('delete deck MyDeck', 'MyDeck', 'deck')).toBe(true);
        expect(validateDeleteConfirmation('delete deck mydeck', 'MyDeck', 'deck')).toBe(true);
        expect(validateDeleteConfirmation('delete deck other', 'MyDeck', 'deck')).toBe(false);
    });
});
