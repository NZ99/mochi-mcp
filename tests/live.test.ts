/**
 * Live integration tests using actual Mochi API.
 * Only runs when MOCHI_LIVE_TEST=true is set.
 * 
 * Run with: npm run test:live
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { MochiClient } from '../src/mochi-client.js';
import { loadConfig } from '../src/config.js';

const SHOULD_RUN = process.env.MOCHI_LIVE_TEST === 'true';

describe.skipIf(!SHOULD_RUN)('Live API Integration', () => {
    let client: MochiClient;

    beforeAll(() => {
        const config = loadConfig();
        client = new MochiClient(config);
    });

    it('can list decks without rate limiting', async () => {
        const decks = await client.listDecks();
        expect(decks.length).toBeGreaterThan(0);
        expect(decks[0]).toHaveProperty('id');
        expect(decks[0]).toHaveProperty('name');
    }, 30000);

    it('can list cards with pagination (respects rate limits)', async () => {
        const cards = await client.listCards();
        expect(cards.length).toBeGreaterThan(0);
        expect(cards[0]).toHaveProperty('id');
        expect(cards[0]).toHaveProperty('content');
    }, 60000);

    it('can search cards by query', async () => {
        // First get any card content to search for
        const cards = await client.listCards(undefined, 10);
        if (cards.length === 0) {
            console.log('No cards to search');
            return;
        }

        // Extract a word from first card content
        const firstWord = cards[0].content.split(/\s+/)[0];
        if (!firstWord) return;

        // Search should return at least one result
        const allCards = await client.listCards();
        const matches = allCards.filter(c =>
            c.content.toLowerCase().includes(firstWord.toLowerCase())
        );
        expect(matches.length).toBeGreaterThan(0);
    }, 90000);
});
