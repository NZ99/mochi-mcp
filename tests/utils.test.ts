/**
 * Tests for utility modules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    generateDiff,
    createToken,
    consumeToken,
    getToken,
    clearAllTokens
} from '../src/utils/index.js';

describe('generateDiff', () => {
    it('returns no changes for identical content', () => {
        const result = generateDiff('hello world', 'hello world');
        expect(result.hasChanges).toBe(false);
    });

    it('shows added lines with +', () => {
        const result = generateDiff('line1', 'line1\nline2');
        expect(result.hasChanges).toBe(true);
        expect(result.diff).toContain('+ line2');
    });

    it('shows removed lines with -', () => {
        const result = generateDiff('line1\nline2', 'line1');
        expect(result.hasChanges).toBe(true);
        expect(result.diff).toContain('- line2');
    });

    it('shows modified lines with - and +', () => {
        const result = generateDiff('old text', 'new text');
        expect(result.hasChanges).toBe(true);
        expect(result.diff).toContain('- old text');
        expect(result.diff).toContain('+ new text');
    });
});

describe('tokens', () => {
    beforeEach(() => {
        clearAllTokens();
    });

    it('creates and consumes token', () => {
        const token = createToken('create_card', { content: 'test' }, 10);
        expect(token).toHaveLength(16);

        const operation = consumeToken(token);
        expect(operation).not.toBeNull();
        expect(operation!.type).toBe('create_card');
        expect(operation!.data).toEqual({ content: 'test' });
    });

    it('returns null for consumed token on second use', () => {
        const token = createToken('update_card', { cardId: '123' }, 10);

        consumeToken(token); // First use
        const second = consumeToken(token); // Second use

        expect(second).toBeNull();
    });

    it('returns null for invalid token', () => {
        const result = consumeToken('nonexistent-token');
        expect(result).toBeNull();
    });

    it('getToken does not consume the token', () => {
        const token = createToken('create_card', { test: true }, 10);

        const first = getToken(token);
        const second = getToken(token);

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
    });

    it('rejects expired tokens', async () => {
        const token = createToken('create_card', {}, 0.001); // ~60ms expiry

        // Wait for expiry
        await new Promise(resolve => setTimeout(resolve, 100));

        const result = consumeToken(token);
        expect(result).toBeNull();
    });
});
