/**
 * Read-only tools for browsing and searching Mochi cards.
 * These are safe operations that don't modify data.
 */

import { z } from 'zod';
import { MochiClient, MochiCard, MochiDeck } from '../mochi-client.js';

// ============================================================================
// Schemas
// ============================================================================

export const ListDecksSchema = z.object({
    includeArchived: z.boolean().optional().default(false),
});

export const GetDeckSchema = z.object({
    deckId: z.string().describe('The deck ID to retrieve'),
});

export const GetCardSchema = z.object({
    cardId: z.string().describe('The card ID to retrieve'),
});

export const SearchCardsSchema = z.object({
    query: z.string().optional().describe('Text to search for in card content'),
    deckId: z.string().describe('Deck ID (required)'),
    tags: z.array(z.string()).optional().describe('Filter by tags (all must match)'),
    limit: z.number().int().min(1).max(50).optional().default(20),
});

// ============================================================================
// Tool Handlers
// ============================================================================

export async function handleListDecks(
    client: MochiClient,
    args: z.infer<typeof ListDecksSchema>
): Promise<{ decks: Array<{ id: string; name: string; parentId: string | null; cardCount?: number }> }> {
    const allDecks = await client.listDecks();

    // Filter archived if needed
    const decks = args.includeArchived
        ? allDecks
        : allDecks.filter(d => !d['archived?'] && !d['trashed?']);

    return {
        decks: decks.map(d => ({
            id: d.id,
            name: d.name,
            parentId: d['parent-id'] || null,
        })),
    };
}

export async function handleGetDeck(
    client: MochiClient,
    args: z.infer<typeof GetDeckSchema>
): Promise<{
    deck: { id: string; name: string; parentId: string | null };
    cards: Array<{ id: string; name: string | null; preview: string }>;
}> {
    const deck = await client.getDeck(args.deckId);
    const cards = await client.listCards(args.deckId);

    // Filter out trashed cards
    const activeCards = cards.filter(c => !c['trashed?']);

    return {
        deck: {
            id: deck.id,
            name: deck.name,
            parentId: deck['parent-id'] || null,
        },
        cards: activeCards.map(c => ({
            id: c.id,
            name: c.name || null,
            preview: c.content.slice(0, 100) + (c.content.length > 100 ? '...' : ''),
        })),
    };
}

export async function handleGetCard(
    client: MochiClient,
    args: z.infer<typeof GetCardSchema>
): Promise<{
    id: string;
    content: string;
    deckId: string;
    tags: string[];
    createdAt: string;
    updatedAt: string | null;
}> {
    const card = await client.getCard(args.cardId);

    return {
        id: card.id,
        content: card.content,
        deckId: card['deck-id'],
        tags: card.tags || [],
        createdAt: card['created-at']?.date || '',
        updatedAt: card['updated-at']?.date || null,
    };
}

export async function handleSearchCards(
    client: MochiClient,
    args: z.infer<typeof SearchCardsSchema>
): Promise<{
    cards: Array<{
        id: string;
        question: string;
        answer: string;
        tags: string[];
    }>;
    totalFound: number;
}> {
    // Fetch cards from specified deck (deckId is required)
    const allCards = await client.listCards(args.deckId);

    // Filter out trashed cards
    let cards = allCards.filter(c => !c['trashed?']);

    // Filter by query (case-insensitive)
    if (args.query) {
        const queryLower = args.query.toLowerCase();
        cards = cards.filter(c => c.content.toLowerCase().includes(queryLower));
    }

    // Filter by tags (all must match)
    if (args.tags && args.tags.length > 0) {
        const requiredTags = args.tags.map(t => t.toLowerCase());
        cards = cards.filter(c => {
            const cardTags = (c.tags || []).map(t => t.toLowerCase());
            return requiredTags.every(rt => cardTags.includes(rt));
        });
    }

    const totalFound = cards.length;

    // Limit results
    cards = cards.slice(0, args.limit);

    return {
        cards: cards.map(c => {
            // Split content on --- to separate Q and A
            const parts = c.content.split(/\n---\n/);
            const question = parts[0]?.trim() || '';
            const answer = parts[1]?.trim() || '';

            return {
                id: c.id,
                question: question.slice(0, 200) + (question.length > 200 ? '...' : ''),
                answer: answer.slice(0, 200) + (answer.length > 200 ? '...' : ''),
                tags: c.tags || [],
            };
        }),
        totalFound,
    };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract context around the first match of a query in content.
 */
function getMatchContext(content: string, query: string, contextChars = 50): string {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerContent.indexOf(lowerQuery);

    if (matchIndex === -1) return content.slice(0, 100);

    const start = Math.max(0, matchIndex - contextChars);
    const end = Math.min(content.length, matchIndex + query.length + contextChars);

    let context = content.slice(start, end);
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';

    return context;
}
