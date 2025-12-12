/**
 * Comprehensive tests for the MCP improvements:
 * 1. Richer search_cards results (deckId, createdAt, updatedAt, name)
 * 2. list_cards_page pagination tool
 * 3. Truncation/timeout surfacing
 * 4. Tag manipulation helpers
 * 
 * These tests are written BEFORE implementation (TDD).
 * They should fail initially, then pass after implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MochiClient, MochiCard, MochiTimeoutError } from '../src/mochi-client.js';
import { Config } from '../src/config.js';

// We'll import these after they're implemented
// For now, we define the expected interfaces

// =============================================================================
// Test Fixtures
// =============================================================================

const mockConfig: Config = {
    apiKey: 'test-key',
    apiBaseUrl: 'https://app.mochi.cards/api',
    allowDeckDelete: false,
    tokenExpiryMins: 10,
};

const createMockCard = (overrides: Partial<MochiCard> = {}): MochiCard => ({
    id: 'card-default',
    content: 'What is X?\\n---\\nX is Y.',
    'deck-id': 'deck-default',
    name: 'Default Card Name',
    pos: '1',
    tags: ['tag1', 'tag2'],
    'created-at': { date: '2025-01-15T10:30:00.000Z' },
    'updated-at': { date: '2025-01-16T11:00:00.000Z' },
    'archived?': false,
    'trashed?': null,
    'new?': false,
    references: [],
    reviews: [],
    ...overrides,
});

// =============================================================================
// 1. RICHER search_cards RESULTS
// =============================================================================

describe('search_cards richer results', () => {
    let mockClient: MochiClient;

    beforeEach(() => {
        vi.resetAllMocks();
        mockClient = {
            listCards: vi.fn(),
            getCard: vi.fn(),
        } as unknown as MochiClient;
    });

    it('returns deckId for each card in search results', async () => {
        const card1 = createMockCard({ id: 'c1', 'deck-id': 'deck-A' });
        const card2 = createMockCard({ id: 'c2', 'deck-id': 'deck-B' });
        vi.mocked(mockClient.listCards).mockResolvedValue([card1, card2]);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 50 });

        expect(result.cards[0]).toHaveProperty('deckId', 'deck-A');
        expect(result.cards[1]).toHaveProperty('deckId', 'deck-B');
    });

    it('returns createdAt timestamp for each card', async () => {
        const card = createMockCard({
            id: 'c1',
            'created-at': { date: '2025-06-20T14:30:00.000Z' }
        });
        vi.mocked(mockClient.listCards).mockResolvedValue([card]);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 50 });

        expect(result.cards[0]).toHaveProperty('createdAt', '2025-06-20T14:30:00.000Z');
    });

    it('returns updatedAt timestamp (null if never updated)', async () => {
        const updatedCard = createMockCard({
            id: 'c1',
            'updated-at': { date: '2025-07-01T09:00:00.000Z' }
        });
        const neverUpdatedCard = createMockCard({
            id: 'c2',
            'updated-at': undefined
        });
        vi.mocked(mockClient.listCards).mockResolvedValue([updatedCard, neverUpdatedCard]);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 50 });

        expect(result.cards[0]).toHaveProperty('updatedAt', '2025-07-01T09:00:00.000Z');
        expect(result.cards[1]).toHaveProperty('updatedAt', null);
    });

    it('returns card name when present', async () => {
        const namedCard = createMockCard({ id: 'c1', name: 'My Special Card' });
        const unnamedCard = createMockCard({ id: 'c2', name: null });
        vi.mocked(mockClient.listCards).mockResolvedValue([namedCard, unnamedCard]);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 50 });

        expect(result.cards[0]).toHaveProperty('name', 'My Special Card');
        expect(result.cards[1]).toHaveProperty('name', null);
    });

    it('still returns question, answer, id, tags (backward compatibility)', async () => {
        const card = createMockCard({
            id: 'c123',
            content: 'What is gravity?\\n---\\nA fundamental force.',
            tags: ['physics', 'forces']
        });
        vi.mocked(mockClient.listCards).mockResolvedValue([card]);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 50 });

        expect(result.cards[0]).toHaveProperty('id', 'c123');
        expect(result.cards[0]).toHaveProperty('question');
        expect(result.cards[0]).toHaveProperty('answer');
        expect(result.cards[0]).toHaveProperty('tags');
        expect(result.cards[0].tags).toContain('physics');
    });
});

// =============================================================================
// 2. TRUNCATION / TIMEOUT SURFACING
// =============================================================================

describe('search_cards truncation and timeout handling', () => {
    let mockClient: MochiClient;

    beforeEach(() => {
        vi.resetAllMocks();
        mockClient = {
            listCards: vi.fn(),
        } as unknown as MochiClient;
    });

    it('returns scannedCount indicating how many cards were scanned', async () => {
        // Simulate fetching 100 cards (less than cap)
        const cards = Array.from({ length: 100 }, (_, i) => createMockCard({ id: `c${i}` }));
        vi.mocked(mockClient.listCards).mockResolvedValue(cards);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 10 });

        expect(result).toHaveProperty('scannedCount');
        expect(result.scannedCount).toBe(100);
    });

    it('sets truncated=true when scan cap is reached (global search)', async () => {
        // Create exactly 1000 cards (the global cap)
        const cards = Array.from({ length: 1000 }, (_, i) => createMockCard({ id: `c${i}` }));
        vi.mocked(mockClient.listCards).mockResolvedValue(cards);

        const { handleSearchCards } = await import('../src/tools/read.js');
        // No deckId = global search, cap is 1000
        const result = await handleSearchCards(mockClient, { limit: 10 });

        expect(result).toHaveProperty('truncated');
        expect(result.truncated).toBe(true);
    });

    it('sets truncated=false when all cards were scanned', async () => {
        // Only 50 cards, well under the cap
        const cards = Array.from({ length: 50 }, (_, i) => createMockCard({ id: `c${i}` }));
        vi.mocked(mockClient.listCards).mockResolvedValue(cards);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 10 });

        expect(result.truncated).toBe(false);
    });

    it('handles timeout gracefully and returns partial=true', async () => {
        // Simulate a timeout after fetching some cards
        vi.mocked(mockClient.listCards).mockRejectedValue(
            new MochiTimeoutError('Timed out after 45000ms. Retrieved 500 cards.')
        );

        const { handleSearchCards } = await import('../src/tools/read.js');

        // Should NOT throw - should return partial results
        const result = await handleSearchCards(mockClient, { limit: 10 });

        expect(result).toHaveProperty('partial', true);
        // Should have some indication of what happened
        expect(result.cards).toBeDefined();
    });

    it('returns partial=false when no timeout occurred', async () => {
        const cards = Array.from({ length: 50 }, (_, i) => createMockCard({ id: `c${i}` }));
        vi.mocked(mockClient.listCards).mockResolvedValue(cards);

        const { handleSearchCards } = await import('../src/tools/read.js');
        const result = await handleSearchCards(mockClient, { limit: 10 });

        expect(result.partial).toBe(false);
    });
});

// =============================================================================
// 3. list_cards_page PAGINATION TOOL
// =============================================================================

describe('handleListCardsPage', () => {
    let mockClient: MochiClient;

    beforeEach(() => {
        vi.resetAllMocks();
        mockClient = {
            listCardsPage: vi.fn(),
        } as unknown as MochiClient;
    });

    it('returns cards with bookmark for continuation', async () => {
        const mockResponse = {
            cards: [createMockCard({ id: 'c1' }), createMockCard({ id: 'c2' })],
            bookmark: 'next-page-cursor-abc123',
        };
        vi.mocked(mockClient.listCardsPage).mockResolvedValue(mockResponse);

        const { handleListCardsPage } = await import('../src/tools/read.js');
        const result = await handleListCardsPage(mockClient, { pageSize: 50 });

        expect(result.cards).toHaveLength(2);
        expect(result).toHaveProperty('bookmark', 'next-page-cursor-abc123');
    });

    it('returns hasMore=true when bookmark is present', async () => {
        const mockResponse = {
            cards: [createMockCard({ id: 'c1' })],
            bookmark: 'has-more-pages',
        };
        vi.mocked(mockClient.listCardsPage).mockResolvedValue(mockResponse);

        const { handleListCardsPage } = await import('../src/tools/read.js');
        const result = await handleListCardsPage(mockClient, { pageSize: 50 });

        expect(result.hasMore).toBe(true);
    });

    it('returns hasMore=false when no bookmark (last page)', async () => {
        const mockResponse = {
            cards: [createMockCard({ id: 'c1' })],
            bookmark: undefined,
        };
        vi.mocked(mockClient.listCardsPage).mockResolvedValue(mockResponse);

        const { handleListCardsPage } = await import('../src/tools/read.js');
        const result = await handleListCardsPage(mockClient, { pageSize: 50 });

        expect(result.hasMore).toBe(false);
        expect(result.bookmark).toBeUndefined();
    });

    it('passes bookmark to continue from previous page', async () => {
        const mockResponse = { cards: [], bookmark: undefined };
        vi.mocked(mockClient.listCardsPage).mockResolvedValue(mockResponse);

        const { handleListCardsPage } = await import('../src/tools/read.js');
        await handleListCardsPage(mockClient, {
            bookmark: 'continue-from-here',
            pageSize: 50
        });

        expect(mockClient.listCardsPage).toHaveBeenCalledWith(
            expect.objectContaining({ bookmark: 'continue-from-here' })
        );
    });

    it('filters by deckId when provided', async () => {
        const mockResponse = { cards: [], bookmark: undefined };
        vi.mocked(mockClient.listCardsPage).mockResolvedValue(mockResponse);

        const { handleListCardsPage } = await import('../src/tools/read.js');
        await handleListCardsPage(mockClient, {
            deckId: 'specific-deck',
            pageSize: 50
        });

        expect(mockClient.listCardsPage).toHaveBeenCalledWith(
            expect.objectContaining({ deckId: 'specific-deck' })
        );
    });

    it('respects pageSize parameter', async () => {
        const mockResponse = { cards: [], bookmark: undefined };
        vi.mocked(mockClient.listCardsPage).mockResolvedValue(mockResponse);

        const { handleListCardsPage } = await import('../src/tools/read.js');
        await handleListCardsPage(mockClient, { pageSize: 25 });

        expect(mockClient.listCardsPage).toHaveBeenCalledWith(
            expect.objectContaining({ pageSize: 25 })
        );
    });

    it('returns rich card data (id, deckId, name, question, answer, tags, createdAt)', async () => {
        const card = createMockCard({
            id: 'rich-card',
            'deck-id': 'deck-xyz',
            name: 'Named Card',
            content: 'Q?\\n---\\nA.',
            tags: ['important'],
            'created-at': { date: '2025-03-01T00:00:00.000Z' },
        });
        vi.mocked(mockClient.listCardsPage).mockResolvedValue({
            cards: [card],
            bookmark: undefined,
        });

        const { handleListCardsPage } = await import('../src/tools/read.js');
        const result = await handleListCardsPage(mockClient, { pageSize: 50 });

        const resultCard = result.cards[0];
        expect(resultCard).toHaveProperty('id', 'rich-card');
        expect(resultCard).toHaveProperty('deckId', 'deck-xyz');
        expect(resultCard).toHaveProperty('name', 'Named Card');
        expect(resultCard).toHaveProperty('question');
        expect(resultCard).toHaveProperty('answer');
        expect(resultCard).toHaveProperty('tags');
        expect(resultCard).toHaveProperty('createdAt', '2025-03-01T00:00:00.000Z');
    });
});

// =============================================================================
// 4. TAG MANIPULATION HELPERS
// =============================================================================

describe('Tag manipulation: add_tags_preview', () => {
    let mockClient: MochiClient;

    beforeEach(() => {
        vi.resetAllMocks();
        mockClient = {
            getCard: vi.fn(),
        } as unknown as MochiClient;
    });

    it('generates preview showing tags to be added', async () => {
        const card = createMockCard({ id: 'c1', tags: ['existing'] });
        vi.mocked(mockClient.getCard).mockResolvedValue(card);

        const { handleAddTagsPreview } = await import('../src/tools/read.js');
        const result = await handleAddTagsPreview(mockClient, mockConfig, {
            cardIds: ['c1'],
            tagsToAdd: ['new-tag', 'another-tag'],
        });

        expect(result.preview).toContain('existing');
        expect(result.preview).toContain('new-tag');
        expect(result.preview).toContain('another-tag');
        expect(result.token).toBeDefined();
        expect(result.token.length).toBeGreaterThan(0);
    });

    it('does not duplicate tags that already exist', async () => {
        const card = createMockCard({ id: 'c1', tags: ['existing', 'already-there'] });
        vi.mocked(mockClient.getCard).mockResolvedValue(card);

        const { handleAddTagsPreview } = await import('../src/tools/read.js');
        const result = await handleAddTagsPreview(mockClient, mockConfig, {
            cardIds: ['c1'],
            tagsToAdd: ['existing', 'brand-new'], // 'existing' should not be duplicated
        });

        // The merged set should have: existing, already-there, brand-new (3 unique)
        expect(result.updates[0].newTags).toEqual(
            expect.arrayContaining(['existing', 'already-there', 'brand-new'])
        );
        expect(result.updates[0].newTags).toHaveLength(3);
    });

    it('handles multiple cards in batch', async () => {
        const card1 = createMockCard({ id: 'c1', tags: ['a'] });
        const card2 = createMockCard({ id: 'c2', tags: ['b'] });
        vi.mocked(mockClient.getCard)
            .mockResolvedValueOnce(card1)
            .mockResolvedValueOnce(card2);

        const { handleAddTagsPreview } = await import('../src/tools/read.js');
        const result = await handleAddTagsPreview(mockClient, mockConfig, {
            cardIds: ['c1', 'c2'],
            tagsToAdd: ['shared-new-tag'],
        });

        expect(result.updates).toHaveLength(2);
        expect(result.updates[0].cardId).toBe('c1');
        expect(result.updates[0].newTags).toContain('shared-new-tag');
        expect(result.updates[1].cardId).toBe('c2');
        expect(result.updates[1].newTags).toContain('shared-new-tag');
    });
});

describe('Tag manipulation: remove_tags_preview', () => {
    let mockClient: MochiClient;

    beforeEach(() => {
        vi.resetAllMocks();
        mockClient = {
            getCard: vi.fn(),
        } as unknown as MochiClient;
    });

    it('generates preview showing tags to be removed', async () => {
        const card = createMockCard({ id: 'c1', tags: ['keep', 'remove-me', 'also-keep'] });
        vi.mocked(mockClient.getCard).mockResolvedValue(card);

        const { handleRemoveTagsPreview } = await import('../src/tools/read.js');
        const result = await handleRemoveTagsPreview(mockClient, mockConfig, {
            cardIds: ['c1'],
            tagsToRemove: ['remove-me'],
        });

        expect(result.updates[0].newTags).toContain('keep');
        expect(result.updates[0].newTags).toContain('also-keep');
        expect(result.updates[0].newTags).not.toContain('remove-me');
        expect(result.token).toBeDefined();
    });

    it('handles removing tags that do not exist (no-op for that tag)', async () => {
        const card = createMockCard({ id: 'c1', tags: ['a', 'b'] });
        vi.mocked(mockClient.getCard).mockResolvedValue(card);

        const { handleRemoveTagsPreview } = await import('../src/tools/read.js');
        const result = await handleRemoveTagsPreview(mockClient, mockConfig, {
            cardIds: ['c1'],
            tagsToRemove: ['nonexistent', 'a'],
        });

        // Should only have 'b' left
        expect(result.updates[0].newTags).toEqual(['b']);
    });

    it('returns hasChanges=false if no tags would actually change', async () => {
        const card = createMockCard({ id: 'c1', tags: ['a', 'b'] });
        vi.mocked(mockClient.getCard).mockResolvedValue(card);

        const { handleRemoveTagsPreview } = await import('../src/tools/read.js');
        const result = await handleRemoveTagsPreview(mockClient, mockConfig, {
            cardIds: ['c1'],
            tagsToRemove: ['nonexistent'], // None of these exist
        });

        expect(result.hasChanges).toBe(false);
    });

    it('handles batch removal across multiple cards', async () => {
        const card1 = createMockCard({ id: 'c1', tags: ['common', 'unique1'] });
        const card2 = createMockCard({ id: 'c2', tags: ['common', 'unique2'] });
        vi.mocked(mockClient.getCard)
            .mockResolvedValueOnce(card1)
            .mockResolvedValueOnce(card2);

        const { handleRemoveTagsPreview } = await import('../src/tools/read.js');
        const result = await handleRemoveTagsPreview(mockClient, mockConfig, {
            cardIds: ['c1', 'c2'],
            tagsToRemove: ['common'],
        });

        expect(result.updates[0].newTags).toEqual(['unique1']);
        expect(result.updates[1].newTags).toEqual(['unique2']);
    });
});

// =============================================================================
// 5. find_deck_by_name TOOL
// =============================================================================

describe('handleFindDeckByName', () => {
    let mockClient: MochiClient;

    beforeEach(() => {
        vi.resetAllMocks();
        mockClient = {
            listDecks: vi.fn(),
        } as unknown as MochiClient;
    });

    it('finds deck by exact name match (case-insensitive)', async () => {
        const decks = [
            { id: 'd1', name: 'Physics', sort: 1, 'archived?': false },
            { id: 'd2', name: 'Chemistry', sort: 2, 'archived?': false },
        ];
        vi.mocked(mockClient.listDecks).mockResolvedValue(decks as any);

        const { handleFindDeckByName } = await import('../src/tools/read.js');
        const result = await handleFindDeckByName(mockClient, { query: 'physics' });

        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].id).toBe('d1');
        expect(result.matches[0].name).toBe('Physics');
    });

    it('finds decks by partial name match', async () => {
        const decks = [
            { id: 'd1', name: 'Schuller Quantum Mechanics', sort: 1, 'archived?': false },
            { id: 'd2', name: 'Schuller General Relativity', sort: 2, 'archived?': false },
            { id: 'd3', name: 'Other Deck', sort: 3, 'archived?': false },
        ];
        vi.mocked(mockClient.listDecks).mockResolvedValue(decks as any);

        const { handleFindDeckByName } = await import('../src/tools/read.js');
        const result = await handleFindDeckByName(mockClient, { query: 'schuller' });

        expect(result.matches).toHaveLength(2);
        expect(result.matches.map(m => m.id)).toContain('d1');
        expect(result.matches.map(m => m.id)).toContain('d2');
    });

    it('returns empty array when no matches found', async () => {
        const decks = [
            { id: 'd1', name: 'Physics', sort: 1, 'archived?': false },
        ];
        vi.mocked(mockClient.listDecks).mockResolvedValue(decks as any);

        const { handleFindDeckByName } = await import('../src/tools/read.js');
        const result = await handleFindDeckByName(mockClient, { query: 'nonexistent' });

        expect(result.matches).toHaveLength(0);
    });

    it('excludes archived/trashed decks by default', async () => {
        const decks = [
            { id: 'd1', name: 'Active Deck', sort: 1, 'archived?': false, 'trashed?': null },
            { id: 'd2', name: 'Archived Deck', sort: 2, 'archived?': true, 'trashed?': null },
            { id: 'd3', name: 'Trashed Deck', sort: 3, 'archived?': false, 'trashed?': '2025-01-01' },
        ];
        vi.mocked(mockClient.listDecks).mockResolvedValue(decks as any);

        const { handleFindDeckByName } = await import('../src/tools/read.js');
        const result = await handleFindDeckByName(mockClient, { query: 'deck' });

        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].id).toBe('d1');
    });
});
