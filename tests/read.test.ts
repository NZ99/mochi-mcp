/**
 * Tests for read tools with mocked Mochi client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleListDecks,
    handleGetDeck,
    handleGetCard,
    handleSearchCards
} from '../src/tools/read.js';
import { MochiClient, MochiCard, MochiDeck } from '../src/mochi-client.js';

// Mock MochiClient
const mockClient = {
    listDecks: vi.fn(),
    getDeck: vi.fn(),
    listCards: vi.fn(),
    getCard: vi.fn(),
} as unknown as MochiClient;

const mockDeck: MochiDeck = {
    id: 'deck1',
    name: 'Test Deck',
    'parent-id': null,
    sort: 1,
    'archived?': false,
    'trashed?': null,
};

const mockCard: MochiCard = {
    id: 'card1',
    content: 'What is a cloze deletion?\n---\nA {{cloze deletion}} hides part of the text.',
    'deck-id': 'deck1',
    name: 'Test Card',
    pos: '1',
    tags: ['test', 'example'],
    'created-at': { date: '2024-01-01T00:00:00Z' },
    'updated-at': { date: '2024-01-02T00:00:00Z' },
    'archived?': false,
    'trashed?': null,
    'new?': true,
    references: [],
    reviews: [],
};

describe('handleListDecks', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns deck list', async () => {
        vi.mocked(mockClient.listDecks).mockResolvedValue([mockDeck]);

        const result = await handleListDecks(mockClient, { includeArchived: false });

        expect(result.decks).toHaveLength(1);
        expect(result.decks[0].id).toBe('deck1');
        expect(result.decks[0].name).toBe('Test Deck');
    });

    it('filters archived decks by default', async () => {
        const archivedDeck = { ...mockDeck, id: 'archived', 'archived?': true };
        vi.mocked(mockClient.listDecks).mockResolvedValue([mockDeck, archivedDeck]);

        const result = await handleListDecks(mockClient, { includeArchived: false });

        expect(result.decks).toHaveLength(1);
        expect(result.decks[0].id).toBe('deck1');
    });

    it('includes archived when requested', async () => {
        const archivedDeck = { ...mockDeck, id: 'archived', 'archived?': true };
        vi.mocked(mockClient.listDecks).mockResolvedValue([mockDeck, archivedDeck]);

        const result = await handleListDecks(mockClient, { includeArchived: true });

        expect(result.decks).toHaveLength(2);
    });
});

describe('handleGetDeck', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns deck with cards', async () => {
        vi.mocked(mockClient.getDeck).mockResolvedValue(mockDeck);
        vi.mocked(mockClient.listCards).mockResolvedValue([mockCard]);

        const result = await handleGetDeck(mockClient, { deckId: 'deck1' });

        expect(result.deck.name).toBe('Test Deck');
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].id).toBe('card1');
    });
});

describe('handleGetCard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns full card content', async () => {
        vi.mocked(mockClient.getCard).mockResolvedValue(mockCard);

        const result = await handleGetCard(mockClient, { cardId: 'card1' });

        expect(result.id).toBe('card1');
        expect(result.content).toContain('cloze deletion');
        expect(result.tags).toEqual(['test', 'example']);
    });
});

describe('handleSearchCards', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('searches by query and returns Q/A format', async () => {
        vi.mocked(mockClient.listCards).mockResolvedValue([mockCard]);

        const result = await handleSearchCards(mockClient, { deckId: 'deck1', query: 'cloze', limit: 20 });

        expect(result.totalFound).toBe(1);
        expect(result.cards[0].id).toBe('card1');
        expect(result.cards[0].question).toContain('cloze deletion');
        expect(result.cards[0].answer).toContain('cloze deletion');
    });

    it('filters by tags', async () => {
        vi.mocked(mockClient.listCards).mockResolvedValue([mockCard]);

        const result = await handleSearchCards(mockClient, { deckId: 'deck1', tags: ['test'], limit: 20 });
        expect(result.totalFound).toBe(1);

        const noMatch = await handleSearchCards(mockClient, { deckId: 'deck1', tags: ['nonexistent'], limit: 20 });
        expect(noMatch.totalFound).toBe(0);
    });

    it('respects limit', async () => {
        const manyCards = Array.from({ length: 30 }, (_, i) => ({
            ...mockCard,
            id: `card${i}`,
        }));
        vi.mocked(mockClient.listCards).mockResolvedValue(manyCards);

        const result = await handleSearchCards(mockClient, { deckId: 'deck1', limit: 5 });

        expect(result.cards).toHaveLength(5);
        expect(result.totalFound).toBe(30);
    });

    it('filters out trashed cards', async () => {
        const trashedCard = { ...mockCard, id: 'trashed', 'trashed?': '2024-01-01' };
        vi.mocked(mockClient.listCards).mockResolvedValue([mockCard, trashedCard]);

        const result = await handleSearchCards(mockClient, { deckId: 'deck1', limit: 20 });

        expect(result.totalFound).toBe(1);
        expect(result.cards[0].id).toBe('card1');
    });

    it('filters by creation date', async () => {
        const oldCard = { ...mockCard, id: 'old', 'created-at': { date: '2023-01-01T00:00:00Z' } };
        const newCard = { ...mockCard, id: 'new', 'created-at': { date: '2025-01-01T00:00:00Z' } };
        vi.mocked(mockClient.listCards).mockResolvedValue([oldCard, newCard]);

        // Filter created after 2024
        const resultAfter = await handleSearchCards(mockClient, {
            deckId: 'deck1',
            createdAfter: '2024-01-01',
            limit: 20
        });
        expect(resultAfter.totalFound).toBe(1);
        expect(resultAfter.cards[0].id).toBe('new');

        // Filter created before 2024
        const resultBefore = await handleSearchCards(mockClient, {
            deckId: 'deck1',
            createdBefore: '2024-01-01',
            limit: 20
        });
        expect(resultBefore.totalFound).toBe(1);
        expect(resultBefore.cards[0].id).toBe('old');
    });
});
