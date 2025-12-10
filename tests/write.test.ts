/**
 * Tests for write tools - two-phase commit and confirmations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleCreateCardPreview,
    handleApplyCreateCard,
    handleUpdateCardPreview,
    handleApplyUpdateCard,
    handleDeleteCard,
    handleDeleteDeck,
} from '../src/tools/write.js';
import { clearAllTokens } from '../src/utils/index.js';
import { MochiClient, MochiCard, MochiDeck } from '../src/mochi-client.js';
import { Config } from '../src/config.js';

// Mock config
const mockConfig: Config = {
    apiKey: 'test-key',
    apiBaseUrl: 'https://app.mochi.cards/api',
    allowDeckDelete: false,
    tokenExpiryMins: 10,
};

// Mock client
const mockClient = {
    getDeck: vi.fn(),
    getCard: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    deleteDeck: vi.fn(),
} as unknown as MochiClient;

const mockDeck: MochiDeck = {
    id: 'deck1',
    name: 'Test Deck',
    'parent-id': null,
    sort: 1,
    'archived?': false,
};

const mockCard: MochiCard = {
    id: 'card1',
    content: 'Original content',
    'deck-id': 'deck1',
    name: null,
    pos: '1',
    tags: [],
    'created-at': { date: '2024-01-01T00:00:00Z' },
    'archived?': false,
    'new?': true,
    references: [],
    reviews: [],
};

describe('Card Creation (Two-Phase)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        clearAllTokens();
    });

    it('creates preview with token', async () => {
        vi.mocked(mockClient.getDeck).mockResolvedValue(mockDeck);

        const result = await handleCreateCardPreview(mockClient, mockConfig, {
            deckId: 'deck1',
            content: 'New card content',
        });

        expect(result.token).toHaveLength(16);
        expect(result.preview).toContain('New card content');
        expect(result.preview).toContain('Test Deck');
    });

    it('applies creation with valid token', async () => {
        vi.mocked(mockClient.getDeck).mockResolvedValue(mockDeck);
        vi.mocked(mockClient.createCard).mockResolvedValue({
            ...mockCard,
            id: 'newcard',
            content: 'New card content',
        });

        // First get preview
        const preview = await handleCreateCardPreview(mockClient, mockConfig, {
            deckId: 'deck1',
            content: 'New card content',
        });

        // Then apply with confirmation
        const result = await handleApplyCreateCard(mockClient, {
            token: preview.token,
            confirmation: 'confirm create'
        });

        expect(result.success).toBe(true);
        expect(result.card?.id).toBe('newcard');
        expect(mockClient.createCard).toHaveBeenCalled();
    });

    it('rejects invalid token', async () => {
        const result = await handleApplyCreateCard(mockClient, {
            token: 'invalid',
            confirmation: 'confirm create'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid or expired');
    });

    it('token is single-use', async () => {
        vi.mocked(mockClient.getDeck).mockResolvedValue(mockDeck);
        vi.mocked(mockClient.createCard).mockResolvedValue({ ...mockCard, id: 'new' });

        const preview = await handleCreateCardPreview(mockClient, mockConfig, {
            deckId: 'deck1',
            content: 'Test',
        });

        // First use succeeds
        const first = await handleApplyCreateCard(mockClient, {
            token: preview.token,
            confirmation: 'confirm create'
        });
        expect(first.success).toBe(true);

        // Second use fails
        const second = await handleApplyCreateCard(mockClient, {
            token: preview.token,
            confirmation: 'confirm create'
        });
        expect(second.success).toBe(false);
    });
});

describe('Card Update (Two-Phase)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        clearAllTokens();
    });

    it('shows diff in preview', async () => {
        vi.mocked(mockClient.getCard).mockResolvedValue(mockCard);

        const result = await handleUpdateCardPreview(mockClient, mockConfig, {
            cardId: 'card1',
            content: 'Modified content',
        });

        expect(result.hasChanges).toBe(true);
        expect(result.diff).toContain('- Original content');
        expect(result.diff).toContain('+ Modified content');
        expect(result.token).toHaveLength(16);
    });

    it('detects no changes', async () => {
        vi.mocked(mockClient.getCard).mockResolvedValue(mockCard);

        const result = await handleUpdateCardPreview(mockClient, mockConfig, {
            cardId: 'card1',
            content: 'Original content', // Same as original
        });

        expect(result.hasChanges).toBe(false);
    });

    it('applies update with valid token', async () => {
        vi.mocked(mockClient.getCard).mockResolvedValue(mockCard);
        vi.mocked(mockClient.updateCard).mockResolvedValue({
            ...mockCard,
            content: 'Modified content',
        });

        const preview = await handleUpdateCardPreview(mockClient, mockConfig, {
            cardId: 'card1',
            content: 'Modified content',
        });

        const result = await handleApplyUpdateCard(mockClient, {
            token: preview.token,
            confirmation: 'confirm update'
        });

        expect(result.success).toBe(true);
        expect(result.card?.content).toBe('Modified content');
    });
});

describe('Card Deletion (Typed Confirmation)', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('requires correct confirmation string', async () => {
        const result = await handleDeleteCard(mockClient, {
            cardId: 'card1',
            confirmation: 'wrong confirmation',
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain('delete card card1');
        expect(mockClient.deleteCard).not.toHaveBeenCalled();
    });

    it('deletes with correct confirmation', async () => {
        vi.mocked(mockClient.deleteCard).mockResolvedValue();

        const result = await handleDeleteCard(mockClient, {
            cardId: 'card1',
            confirmation: 'delete card card1',
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain('moved to trash');
        expect(mockClient.deleteCard).toHaveBeenCalledWith('card1', undefined);
    });

    it('handles permanent delete', async () => {
        vi.mocked(mockClient.deleteCard).mockResolvedValue();

        const result = await handleDeleteCard(mockClient, {
            cardId: 'card1',
            confirmation: 'delete card card1',
            permanent: true,
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain('permanently deleted');
        expect(mockClient.deleteCard).toHaveBeenCalledWith('card1', true);
    });
});

describe('Deck Deletion', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('is disabled by default', async () => {
        const result = await handleDeleteDeck(mockClient, mockConfig, {
            deckId: 'deck1',
            confirmation: 'delete deck Test Deck',
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain('disabled');
        expect(mockClient.deleteDeck).not.toHaveBeenCalled();
    });

    it('works when enabled with correct confirmation', async () => {
        const enabledConfig = { ...mockConfig, allowDeckDelete: true };
        vi.mocked(mockClient.getDeck).mockResolvedValue(mockDeck);
        vi.mocked(mockClient.deleteDeck).mockResolvedValue();

        const result = await handleDeleteDeck(mockClient, enabledConfig, {
            deckId: 'deck1',
            confirmation: 'delete deck Test Deck',
        });

        expect(result.success).toBe(true);
        expect(mockClient.deleteDeck).toHaveBeenCalled();
    });

    it('requires deck name (not ID) in confirmation', async () => {
        const enabledConfig = { ...mockConfig, allowDeckDelete: true };
        vi.mocked(mockClient.getDeck).mockResolvedValue(mockDeck);

        const result = await handleDeleteDeck(mockClient, enabledConfig, {
            deckId: 'deck1',
            confirmation: 'delete deck deck1', // Using ID instead of name
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain('delete deck Test Deck');
    });
});
