/**
 * Read-only tools for browsing and searching Mochi cards.
 * These are safe operations that don't modify data.
 */

import { z } from 'zod';
import { MochiClient, MochiCard, MochiDeck, MochiTimeoutError } from '../mochi-client.js';
import { parseCardContent } from '../utils/markdown.js';

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

export const GetCardsSchema = z.object({
    cardIds: z.array(z.string()).describe('List of card IDs to retrieve'),
});

export const SearchCardsSchema = z.object({
    query: z.string().optional().describe('Text to search for in card content'),
    deckId: z.string().optional().describe('Deck ID (optional - searches all decks if omitted)'),
    tags: z.array(z.string()).optional().describe('Filter by tags (all must match)'),
    createdAfter: z.string().optional().describe('Filter cards created on or after this date (ISO 8601 YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ). To search for "today" or "yesterday", calculate the date and pass it here.'),
    createdBefore: z.string().optional().describe('Filter cards created before this date (ISO 8601 YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)'),
    limit: z.number().int().min(1).max(50).optional().default(20),
});

export const ListCardsPageSchema = z.object({
    deckId: z.string().optional().describe('Deck ID (optional - lists from all decks if omitted)'),
    bookmark: z.string().optional().describe('Pagination cursor from previous response'),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
});

export const FindDeckByNameSchema = z.object({
    query: z.string().describe('Name or partial name to search for'),
});

export const AddTagsPreviewSchema = z.object({
    cardIds: z.array(z.string()).describe('Card IDs to add tags to'),
    tagsToAdd: z.array(z.string()).describe('Tags to add'),
});

export const RemoveTagsPreviewSchema = z.object({
    cardIds: z.array(z.string()).describe('Card IDs to remove tags from'),
    tagsToRemove: z.array(z.string()).describe('Tags to remove'),
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
    question: string;
    answer: string;
}> {
    const card = await client.getCard(args.cardId);
    const { question, answer } = parseCardContent(card.content);

    return {
        id: card.id,
        content: card.content,
        question,
        answer,
        deckId: card['deck-id'],
        tags: card.tags || [],
        createdAt: card['created-at']?.date || '',
        updatedAt: card['updated-at']?.date || null,
    };
}

export async function handleGetCards(
    client: MochiClient,
    args: z.infer<typeof GetCardsSchema>
): Promise<{
    cards: Array<{
        id: string;
        content: string;
        question: string;
        answer: string;
        deckId: string;
        tags: string[];
    }>;
}> {
    // Process sequentially to honor API rate limits
    const cards: Array<{
        id: string;
        content: string;
        question: string;
        answer: string;
        deckId: string;
        tags: string[];
    }> = [];

    for (const id of args.cardIds) {
        try {
            const card = await client.getCard(id);
            const { question, answer } = parseCardContent(card.content);
            cards.push({
                id: card.id,
                content: card.content,
                question,
                answer,
                deckId: card['deck-id'],
                tags: card.tags || [],
            });
        } catch (error) {
            // For now we'll let it fail if one fails, or we could log and continue.
            // Given the prompt constraints, failing fast is acceptable, but let's at least log it if we were in a context where that helped.
            // For now, rethrow.
            throw error;
        }
    }

    return { cards };
}

export async function handleSearchCards(
    client: MochiClient,
    args: z.infer<typeof SearchCardsSchema>
): Promise<{
    cards: Array<{
        id: string;
        deckId: string;
        name: string | null;
        question: string;
        answer: string;
        tags: string[];
        createdAt: string;
        updatedAt: string | null;
    }>;
    totalFound: number;
    scannedCount: number;
    truncated: boolean;
    partial: boolean;
}> {
    // Fetch cards from specified deck
    // If deckId is not provided, we limit the fetch to 1000 cards to prevent timeouts.
    const fetchLimit = args.deckId ? 5000 : 1000;

    let allCards: MochiCard[] = [];
    let partial = false;

    try {
        allCards = await client.listCards(args.deckId, fetchLimit);
    } catch (error) {
        if (error instanceof MochiTimeoutError) {
            // Graceful degradation: return empty results with partial flag
            partial = true;
            allCards = [];
        } else {
            throw error;
        }
    }

    const scannedCount = allCards.length;
    const truncated = scannedCount >= fetchLimit;

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

    // Filter by created date
    if (args.createdAfter) {
        const afterDate = new Date(args.createdAfter).getTime();
        cards = cards.filter(c => c['created-at'] && new Date(c['created-at'].date).getTime() >= afterDate);
    }

    if (args.createdBefore) {
        const beforeDate = new Date(args.createdBefore).getTime();
        cards = cards.filter(c => c['created-at'] && new Date(c['created-at'].date).getTime() < beforeDate);
    }

    const totalFound = cards.length;

    // Limit results
    cards = cards.slice(0, args.limit);

    return {
        cards: cards.map(c => {
            const { question, answer } = parseCardContent(c.content);

            return {
                id: c.id,
                deckId: c['deck-id'],
                name: c.name || null,
                question: question.slice(0, 200) + (question.length > 200 ? '...' : ''),
                answer: answer.slice(0, 200) + (answer.length > 200 ? '...' : ''),
                tags: c.tags || [],
                createdAt: c['created-at']?.date || '',
                updatedAt: c['updated-at']?.date || null,
            };
        }),
        totalFound,
        scannedCount,
        truncated,
        partial,
    };
}

// ============================================================================
// Pagination Tool
// ============================================================================

export async function handleListCardsPage(
    client: MochiClient,
    args: z.infer<typeof ListCardsPageSchema>
): Promise<{
    cards: Array<{
        id: string;
        deckId: string;
        name: string | null;
        question: string;
        answer: string;
        tags: string[];
        createdAt: string;
        updatedAt: string | null;
    }>;
    bookmark?: string;
    hasMore: boolean;
}> {
    const response = await client.listCardsPage({
        deckId: args.deckId,
        bookmark: args.bookmark,
        pageSize: args.pageSize,
    });

    const cards = response.cards.filter(c => !c['trashed?']);

    return {
        cards: cards.map(c => {
            const { question, answer } = parseCardContent(c.content);
            return {
                id: c.id,
                deckId: c['deck-id'],
                name: c.name || null,
                question: question.slice(0, 200) + (question.length > 200 ? '...' : ''),
                answer: answer.slice(0, 200) + (answer.length > 200 ? '...' : ''),
                tags: c.tags || [],
                createdAt: c['created-at']?.date || '',
                updatedAt: c['updated-at']?.date || null,
            };
        }),
        bookmark: response.bookmark,
        hasMore: !!response.bookmark,
    };
}

// ============================================================================
// Find Deck By Name
// ============================================================================

export async function handleFindDeckByName(
    client: MochiClient,
    args: z.infer<typeof FindDeckByNameSchema>
): Promise<{
    matches: Array<{
        id: string;
        name: string;
        parentId: string | null;
    }>;
}> {
    const allDecks = await client.listDecks();
    const queryLower = args.query.toLowerCase();

    const matches = allDecks
        .filter(d => !d['archived?'] && !d['trashed?'])
        .filter(d => d.name.toLowerCase().includes(queryLower))
        .map(d => ({
            id: d.id,
            name: d.name,
            parentId: d['parent-id'] || null,
        }));

    return { matches };
}

// ============================================================================
// Tag Manipulation Helpers
// ============================================================================

import { Config } from '../config.js';
import { createToken } from '../utils/index.js';

export async function handleAddTagsPreview(
    client: MochiClient,
    config: Config,
    args: z.infer<typeof AddTagsPreviewSchema>
): Promise<{
    preview: string;
    token: string;
    updates: Array<{
        cardId: string;
        oldTags: string[];
        newTags: string[];
    }>;
    hasChanges: boolean;
}> {
    const updates: Array<{ cardId: string; oldTags: string[]; newTags: string[] }> = [];
    const previewLines: string[] = [];

    for (const cardId of args.cardIds) {
        const card = await client.getCard(cardId);
        const oldTags = card.tags || [];
        const tagSet = new Set(oldTags.map(t => t.toLowerCase()));
        const newTagsToAdd = args.tagsToAdd.filter(t => !tagSet.has(t.toLowerCase()));
        const newTags = [...oldTags, ...newTagsToAdd];

        updates.push({ cardId, oldTags, newTags });
        previewLines.push(`Card ${cardId}: [${oldTags.join(', ')}] → [${newTags.join(', ')}]`);
    }

    const hasChanges = updates.some(u => u.newTags.length !== u.oldTags.length);
    const token = createToken(
        'batch_tag_update',
        {
            updates: updates.map(u => ({
                cardId: u.cardId,
                tags: u.newTags,
            })),
        },
        config.tokenExpiryMins
    );

    return {
        preview: previewLines.join('\n'),
        token,
        updates,
        hasChanges,
    };
}

export async function handleRemoveTagsPreview(
    client: MochiClient,
    config: Config,
    args: z.infer<typeof RemoveTagsPreviewSchema>
): Promise<{
    preview: string;
    token: string;
    updates: Array<{
        cardId: string;
        oldTags: string[];
        newTags: string[];
    }>;
    hasChanges: boolean;
}> {
    const updates: Array<{ cardId: string; oldTags: string[]; newTags: string[] }> = [];
    const previewLines: string[] = [];
    const tagsToRemoveLower = new Set(args.tagsToRemove.map(t => t.toLowerCase()));

    for (const cardId of args.cardIds) {
        const card = await client.getCard(cardId);
        const oldTags = card.tags || [];
        const newTags = oldTags.filter(t => !tagsToRemoveLower.has(t.toLowerCase()));

        updates.push({ cardId, oldTags, newTags });
        previewLines.push(`Card ${cardId}: [${oldTags.join(', ')}] → [${newTags.join(', ')}]`);
    }

    const hasChanges = updates.some(u => u.newTags.length !== u.oldTags.length);
    const token = createToken(
        'batch_tag_update',
        {
            updates: updates.map(u => ({
                cardId: u.cardId,
                tags: u.newTags,
            })),
        },
        config.tokenExpiryMins
    );

    return {
        preview: previewLines.join('\n'),
        token,
        updates,
        hasChanges,
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
