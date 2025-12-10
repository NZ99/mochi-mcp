/**
 * Tests for MochiClient pagination logic.
 * These tests verify the client correctly handles Mochi's pagination quirks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the actual pagination logic, not mock it
// This requires testing the client internals

describe('MochiClient pagination', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('stops when bookmark repeats (Mochi API quirk)', async () => {
        // This is the bug we missed - Mochi returns same bookmark at end of pagination
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    docs: [{ id: '1', name: 'Deck 1' }],
                    bookmark: 'bookmark-page-1'
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    docs: [{ id: '2', name: 'Deck 2' }],
                    bookmark: 'bookmark-page-2'
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    docs: [{ id: '3', name: 'Deck 3' }],
                    bookmark: 'bookmark-page-2' // Same bookmark! Should stop here
                })
            });

        global.fetch = mockFetch as unknown as typeof fetch;

        const { MochiClient } = await import('../src/mochi-client.js');
        const client = new MochiClient({
            apiKey: 'test-key',
            apiBaseUrl: 'https://test.api',
            allowDeckDelete: false,
            tokenExpiryMins: 10,
        });

        const decks = await client.listDecks();

        // Should have stopped after 3 requests, not looped forever
        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(decks).toHaveLength(3);
    });

    it('stops when docs array is empty', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    docs: [{ id: '1', name: 'Deck 1' }],
                    bookmark: 'bookmark-1'
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    docs: [], // Empty! Should stop
                    bookmark: 'bookmark-2'
                })
            });

        global.fetch = mockFetch as unknown as typeof fetch;

        const { MochiClient } = await import('../src/mochi-client.js');
        const client = new MochiClient({
            apiKey: 'test-key',
            apiBaseUrl: 'https://test.api',
            allowDeckDelete: false,
            tokenExpiryMins: 10,
        });

        const decks = await client.listDecks();

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(decks).toHaveLength(1);
    });

    it('stops when no bookmark returned', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    docs: [{ id: '1', name: 'Deck 1' }],
                    // No bookmark - should stop
                })
            });

        global.fetch = mockFetch as unknown as typeof fetch;

        const { MochiClient } = await import('../src/mochi-client.js');
        const client = new MochiClient({
            apiKey: 'test-key',
            apiBaseUrl: 'https://test.api',
            allowDeckDelete: false,
            tokenExpiryMins: 10,
        });

        const decks = await client.listDecks();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(decks).toHaveLength(1);
    });
});
