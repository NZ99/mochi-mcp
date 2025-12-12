/**
 * Write tools for creating, updating, and deleting cards/decks.
 * Uses two-phase commit for card mutations and typed confirmations for deletes.
 */

import { z } from 'zod';
import { MochiClient } from '../mochi-client.js';
import { Config, validateDeleteConfirmation } from '../config.js';
import { createToken, consumeToken, generateDiff } from '../utils/index.js';
import { parseCardContent, buildCardContent } from '../utils/markdown.js';

// ============================================================================
// Schemas
// ============================================================================

// Card creation
export const CreateCardPreviewSchema = z.object({
    deckId: z.string().describe('Deck ID to create card in'),
    content: z.string().describe('Markdown content for the card'),
    tags: z.array(z.string()).optional().describe('Tags to add to the card'),
});

export const ApplyCreateCardSchema = z.object({
    token: z.string().describe('Confirmation token from create_card_preview'),
    confirmation: z.string().describe('Must be exactly: "confirm create"'),
});

// Card update  
export const UpdateCardPreviewSchema = z.object({
    cardId: z.string().describe('Card ID to update'),
    content: z.string().describe('New markdown content'),
    tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
});

export const UpdateCardFieldsPreviewSchema = z.object({
    cardId: z.string().describe('Card ID to update'),
    question: z.string().optional().describe('New question text'),
    answer: z.string().optional().describe('New answer text'),
    tags: z.array(z.string()).optional().describe('New tags'),
});

export const ApplyUpdateCardSchema = z.object({
    token: z.string().describe('Confirmation token from update_card_preview'),
    confirmation: z.string().describe('Must be exactly: "confirm update"'),
});

// Batch update
export const UpdateCardsBatchPreviewSchema = z.object({
    updates: z.array(z.object({
        cardId: z.string(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
    })).describe('List of updates to apply'),
});

export const ApplyUpdateCardsBatchSchema = z.object({
    token: z.string().describe('Confirmation token from update_cards_batch_preview'),
    confirmation: z.string().describe('Must be exactly: "confirm batch update"'),
});

// Tag update
export const ApplyTagsUpdateSchema = z.object({
    token: z.string().describe('Token from add_tags_preview or remove_tags_preview'),
    confirmation: z.string().describe('Must be exactly: "confirm tags"'),
});

// Card deletion
export const DeleteCardSchema = z.object({
    cardId: z.string().describe('Card ID to delete'),
    confirmation: z.string().describe('Must be exactly: "delete card <cardId>"'),
    permanent: z.boolean().optional().default(false).describe('Hard delete (cannot be undone)'),
});

// Deck operations
export const CreateDeckSchema = z.object({
    name: z.string().min(1).max(100).describe('Name for the new deck'),
    parentId: z.string().optional().describe('Parent deck ID for nesting'),
});

export const DeleteDeckSchema = z.object({
    deckId: z.string().describe('Deck ID to delete'),
    confirmation: z.string().describe('Must be exactly: "delete deck <deckName>"'),
});

// ============================================================================
// Card Creation (Two-Phase)
// ============================================================================

export async function handleCreateCardPreview(
    client: MochiClient,
    config: Config,
    args: z.infer<typeof CreateCardPreviewSchema>
): Promise<{
    preview: string;
    token: string;
    expiresAt: string;
    message: string;
}> {
    // Verify deck exists
    const deck = await client.getDeck(args.deckId);

    // Create preview
    const preview = [
        `**Creating new card in deck:** ${deck.name} (${args.deckId})`,
        '',
        '**Content:**',
        '```',
        args.content,
        '```',
        args.tags && args.tags.length > 0 ? `\n**Tags:** ${args.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // Generate token
    const token = createToken('create_card', {
        deckId: args.deckId,
        content: args.content,
        tags: args.tags,
    }, config.tokenExpiryMins);

    const expiresAt = new Date(Date.now() + config.tokenExpiryMins * 60 * 1000).toISOString();

    return {
        preview,
        token,
        expiresAt,
        message: `Review the card above. To create it, user must type: "confirm create"`,
    };
}

export async function handleApplyCreateCard(
    client: MochiClient,
    args: z.infer<typeof ApplyCreateCardSchema>
): Promise<{
    success: boolean;
    card?: { id: string; content: string; deckId: string };
    error?: string;
}> {
    const operation = consumeToken(args.token);

    if (!operation) {
        return {
            success: false,
            error: 'Invalid or expired token. Please call create_card_preview again.',
        };
    }

    if (operation.type !== 'create_card') {
        return {
            success: false,
            error: 'Token is not for card creation.',
        };
    }

    // Validate typed confirmation
    if (args.confirmation.toLowerCase().trim() !== 'confirm create') {
        return {
            success: false,
            error: 'Invalid confirmation. User must type exactly: "confirm create"',
        };
    }

    const data = operation.data as { deckId: string; content: string; tags?: string[] };
    const card = await client.createCard(data.deckId, data.content, data.tags);

    return {
        success: true,
        card: {
            id: card.id,
            content: card.content,
            deckId: card['deck-id'],
        },
    };
}

// ============================================================================
// Card Update (Two-Phase)
// ============================================================================

export async function handleUpdateCardPreview(
    client: MochiClient,
    config: Config,
    args: z.infer<typeof UpdateCardPreviewSchema>
): Promise<{
    original: string;
    proposed: string;
    diff: string;
    hasChanges: boolean;
    token: string;
    expiresAt: string;
    message: string;
}> {
    // Fetch current card
    const card = await client.getCard(args.cardId);

    // Generate diff
    const diffResult = generateDiff(card.content, args.content);

    // Generate token
    const token = createToken('update_card', {
        cardId: args.cardId,
        content: args.content,
        tags: args.tags,
    }, config.tokenExpiryMins);

    const expiresAt = new Date(Date.now() + config.tokenExpiryMins * 60 * 1000).toISOString();

    return {
        original: diffResult.original,
        proposed: diffResult.proposed,
        diff: diffResult.diff,
        hasChanges: diffResult.hasChanges,
        token,
        expiresAt,
        message: diffResult.hasChanges
            ? `Review the changes above. To apply, user must type: "confirm update"`
            : 'No changes detected between original and proposed content.',
    };
}

export async function handleUpdateCardFieldsPreview(
    client: MochiClient,
    config: Config,
    args: z.infer<typeof UpdateCardFieldsPreviewSchema>
): Promise<{
    original: string;
    proposed: string;
    diff: string;
    hasChanges: boolean;
    token: string;
    expiresAt: string;
    message: string;
}> {
    // Fetch current card
    const card = await client.getCard(args.cardId);

    // Parse current content
    const current = parseCardContent(card.content);

    // Determine new content
    const newQuestion = args.question !== undefined ? args.question : current.question;
    const newAnswer = args.answer !== undefined ? args.answer : current.answer;

    // Determine new tags (if provided, otherwise undefined - but check logic)
    // Args.tags optional. If undefined, we don't touch tags. 
    // Wait, update_card expects logic: "If tags is not undefined, it replaces tags". 
    // CreateToken takes tags.

    const newContent = buildCardContent(newQuestion, newAnswer);

    // Generate diff
    const diffResult = generateDiff(card.content, newContent);

    // Generate token - reuse update_card type because the apply logic is identical
    const token = createToken('update_card', {
        cardId: args.cardId,
        content: newContent,
        tags: args.tags,
    }, config.tokenExpiryMins);

    const expiresAt = new Date(Date.now() + config.tokenExpiryMins * 60 * 1000).toISOString();

    return {
        original: diffResult.original,
        proposed: diffResult.proposed,
        diff: diffResult.diff,
        hasChanges: diffResult.hasChanges || (args.tags !== undefined),
        token,
        expiresAt,
        message: (diffResult.hasChanges || args.tags)
            ? `Review the changes above. To apply, user must type: "confirm update"`
            : 'No changes detected between original and proposed content.',
    };
}

export async function handleApplyUpdateCard(
    client: MochiClient,
    args: z.infer<typeof ApplyUpdateCardSchema>
): Promise<{
    success: boolean;
    card?: { id: string; content: string };
    error?: string;
}> {
    const operation = consumeToken(args.token);

    if (!operation) {
        return {
            success: false,
            error: 'Invalid or expired token. Please call update_card_preview again.',
        };
    }

    if (operation.type !== 'update_card') {
        return {
            success: false,
            error: 'Token is not for card update.',
        };
    }

    // Validate typed confirmation
    if (args.confirmation.toLowerCase().trim() !== 'confirm update') {
        return {
            success: false,
            error: 'Invalid confirmation. User must type exactly: "confirm update"',
        };
    }

    const data = operation.data as { cardId: string; content: string; tags?: string[] };
    const card = await client.updateCard(data.cardId, {
        content: data.content,
        tags: data.tags,
    });

    return {
        success: true,
        card: {
            id: card.id,
            content: card.content,
        },
    };
}

// ============================================================================
// Card Deletion (Typed Confirmation)
// ============================================================================

export async function handleDeleteCard(
    client: MochiClient,
    args: z.infer<typeof DeleteCardSchema>
): Promise<{
    success: boolean;
    message: string;
}> {
    // Validate confirmation
    if (!validateDeleteConfirmation(args.confirmation, args.cardId, 'card')) {
        return {
            success: false,
            message: `Invalid confirmation. Must be exactly: "delete card ${args.cardId}"`,
        };
    }

    await client.deleteCard(args.cardId, args.permanent);

    return {
        success: true,
        message: args.permanent
            ? `Card ${args.cardId} permanently deleted.`
            : `Card ${args.cardId} moved to trash. Can be restored from Mochi app.`,
    };
}

// ============================================================================
// Deck Operations
// ============================================================================

export async function handleCreateDeck(
    client: MochiClient,
    args: z.infer<typeof CreateDeckSchema>
): Promise<{
    success: boolean;
    deck: { id: string; name: string };
}> {
    const deck = await client.createDeck(args.name, args.parentId);

    return {
        success: true,
        deck: {
            id: deck.id,
            name: deck.name,
        },
    };
}

export async function handleDeleteDeck(
    client: MochiClient,
    config: Config,
    args: z.infer<typeof DeleteDeckSchema>
): Promise<{
    success: boolean;
    message: string;
}> {
    // Check if deck deletion is enabled
    if (!config.allowDeckDelete) {
        return {
            success: false,
            message: 'Deck deletion is disabled. Set MOCHI_ALLOW_DECK_DELETE=true to enable.',
        };
    }

    // Fetch deck to validate name in confirmation
    const deck = await client.getDeck(args.deckId);

    // Validate confirmation against deck NAME (not ID)
    const expectedConfirmation = `delete deck ${deck.name}`;
    if (args.confirmation.toLowerCase().trim() !== expectedConfirmation.toLowerCase()) {
        return {
            success: false,
            message: `Invalid confirmation. Must be exactly: "${expectedConfirmation}"`,
        };
    }

    await client.deleteDeck(args.deckId, false); // Always soft delete

    return {
        success: true,
        message: `Deck "${deck.name}" moved to trash. Cards inside are preserved but hidden.`,
    };
}

export async function handleUpdateCardsBatchPreview(
    client: MochiClient,
    config: Config,
    args: z.infer<typeof UpdateCardsBatchPreviewSchema>
): Promise<{
    preview: string;
    token: string;
    expiresAt: string;
    message: string;
}> {
    // Process all updates to generate massive preview
    // Fetch all current cards first (optimization: use concurrency)
    const cardIds = args.updates.map(u => u.cardId);
    // Ideally we would have a multi-get, but for now we iterate
    const previews: string[] = [];

    // We'll limit concurrency to avoid calling API too fast? But for now sequential is safer given rate limits mentioned by user.
    for (const update of args.updates) {
        const card = await client.getCard(update.cardId);
        const { diff, hasChanges } = generateDiff(card.content, update.content);

        previews.push(
            `### Card ${update.cardId}${hasChanges ? '' : ' (No Content Changes)'}\n` +
            `${diff}\n` +
            (update.tags ? `**New Tags:** ${update.tags.join(', ')}\n` : '')
        );
    }

    const preview = previews.join('\n\n---\n\n');

    // Create single token for batch
    const token = createToken('batch_update_card', {
        updates: args.updates
    }, config.tokenExpiryMins);

    const expiresAt = new Date(Date.now() + config.tokenExpiryMins * 60 * 1000).toISOString();

    return {
        preview,
        token,
        expiresAt,
        message: `Review the ${args.updates.length} updates above. To apply ALL, user must type: "confirm batch update"`,
    };
}

export async function handleApplyUpdateCardsBatch(
    client: MochiClient,
    args: z.infer<typeof ApplyUpdateCardsBatchSchema>
): Promise<{
    success: boolean;
    results: Array<{ cardId: string; success: boolean; error?: string }>;
    summary: string;
}> {
    const operation = consumeToken(args.token);

    if (!operation || operation.type !== 'batch_update_card') {
        return {
            success: false,
            results: [],
            summary: 'Invalid or expired token.',
        };
    }

    if (args.confirmation.toLowerCase().trim() !== 'confirm batch update') {
        return {
            success: false,
            results: [],
            summary: 'Invalid confirmation text.',
        };
    }

    const data = operation.data as { updates: Array<{ cardId: string; content: string; tags?: string[] }> };
    const results: Array<{ cardId: string; success: boolean; error?: string }> = [];

    // Execute sequentially to avoid rate limits
    // Since we don't have atomic batch, we do best effort.
    for (const update of data.updates) {
        try {
            await client.updateCard(update.cardId, {
                content: update.content,
                tags: update.tags // This replaces tags, as per existing API wrapper logic
            });
            results.push({ cardId: update.cardId, success: true });
        } catch (error) {
            results.push({ cardId: update.cardId, success: false, error: String(error) });
        }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    return {
        success: failCount === 0,
        results,
        summary: `Batch complete. Success: ${successCount}, Failed: ${failCount}`,
    };
}

// ============================================================================
// Tag Update (Apply)
// ============================================================================

export async function handleApplyTagsUpdate(
    client: MochiClient,
    args: z.infer<typeof ApplyTagsUpdateSchema>
): Promise<{
    success: boolean;
    results: Array<{ cardId: string; success: boolean; error?: string }>;
    summary: string;
}> {
    const operation = consumeToken(args.token);

    if (!operation || operation.type !== 'batch_tag_update') {
        return {
            success: false,
            results: [],
            summary: 'Invalid or expired token. Please call add_tags_preview or remove_tags_preview again.',
        };
    }

    if (args.confirmation.toLowerCase().trim() !== 'confirm tags') {
        return {
            success: false,
            results: [],
            summary: 'Invalid confirmation. User must type exactly: "confirm tags"',
        };
    }

    const data = operation.data as { updates: Array<{ cardId: string; tags: string[] }> };
    const results: Array<{ cardId: string; success: boolean; error?: string }> = [];

    // Execute sequentially to avoid rate limits
    for (const update of data.updates) {
        try {
            await client.updateCard(update.cardId, { tags: update.tags });
            results.push({ cardId: update.cardId, success: true });
        } catch (error) {
            results.push({ cardId: update.cardId, success: false, error: String(error) });
        }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    return {
        success: failCount === 0,
        results,
        summary: `Tag update complete. Success: ${successCount}, Failed: ${failCount}`,
    };
}
