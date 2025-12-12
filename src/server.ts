/**
 * MCP Server for Mochi.cards
 * Exposes tools for AI agents to browse, search, and manage flashcards.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Config } from './config.js';
import { MochiClient } from './mochi-client.js';
import * as tools from './tools/index.js';

/**
 * Create and configure the MCP server with all tools.
 */
export function createServer(config: Config): McpServer {
    const client = new MochiClient(config);

    const server = new McpServer({
        name: 'mochi-cards',
        version: '0.1.0',
    });

    // ==========================================================================
    // Prompts
    // ==========================================================================

    server.prompt(
        'mochi_guide',
        'Detailed user guide for Mochi MCP tools and workflows',
        async () => {
            return {
                messages: [
                    {
                        role: 'assistant',
                        content: {
                            type: 'text',
                            text: `
                                # Mochi MCP Server Guide

                                This server manages your Mochi flashcards. Here are the key workflows:

                                ## 1. Finding Cards
                                - **Search**: Use \`search_cards\` to find cards by query, tags, or creation date.
                                  - Returns rich results: id, deckId, name, question, answer, tags, createdAt, updatedAt.
                                  - Also returns: totalFound, scannedCount, truncated, partial (for transparency).
                                - **Date Filtering**: Use \`createdAfter\` / \`createdBefore\` with ISO 8601 UTC strings (e.g., \`2025-12-11T00:00:00.000Z\`).
                                - **Find Deck**: Use \`find_deck_by_name\` when you know the deck name but not its ID.
                                - **Pagination**: For large collections, use \`list_cards_page\` with explicit bookmark control.

                                ## 2. Performance Notes
                                - **Global search** scans at most **1000 cards**.
                                - **Per-deck search** scans at most **5000 cards**.
                                - If you need to scan more, use \`list_cards_page\` with pagination.
                                - The \`truncated\` flag indicates if the scan cap was reached.
                                - The \`partial\` flag indicates if a timeout occurred mid-scan.

                                ## 3. Editing Cards (Two-Phase Commit)
                                All updates require a safety check:
                                1.  **Preview**: Call \`update_card_fields_preview\` (for distinct Q/A edits) or \`update_card_preview\` (for full content).
                                2.  **Review**: The tool returns a DIFF and a TOKEN. Show this diff to the user.
                                3.  **Confirm**: If the user approves, call \`apply_update_card\` with the token.

                                ## 4. Tag Management
                                - **Add Tags**: Use \`add_tags_preview\` to preview adding tags to multiple cards.
                                - **Remove Tags**: Use \`remove_tags_preview\` to preview removing tags.
                                - **Apply**: Call \`apply_tags_update\` with the token. Confirmation: \`"confirm tags"\`

                                ## 5. Batch Updates
                                To update multiple cards efficiently:
                                1.  **Preview**: Call \`update_cards_batch_preview\` with a list of updates.
                                2.  **Review**: This generates a single summary diff and ONE token.
                                3.  **Confirm**: Call \`apply_update_cards_batch\` with the token to execute all updates sequentially.

                                ## 6. Safety
                                - **Timeouts**: Searches traversing the whole database are limited to 45s.
                                - **Rate Limits**: Batch operations run sequentially to respect API limits.
                            `.trim()
                        }
                    }
                ]
            };
        }
    );

    // ==========================================================================
    // Read Tools
    // ==========================================================================

    server.tool(
        'list_decks',
        'List all Mochi flashcard decks',
        { includeArchived: z.boolean().optional().describe('Include archived decks') },
        async (args) => {
            const parsed = tools.ListDecksSchema.parse(args);
            const result = await tools.handleListDecks(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'get_deck',
        'Get deck details and list of cards',
        { deckId: z.string().describe('Deck ID to retrieve') },
        async (args) => {
            const parsed = tools.GetDeckSchema.parse(args);
            const result = await tools.handleGetDeck(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'get_card',
        'Get full content of a single card',
        { cardId: z.string().describe('Card ID to retrieve') },
        async (args) => {
            const parsed = tools.GetCardSchema.parse(args);
            const result = await tools.handleGetCard(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'get_cards',
        'Get content of multiple cards (bulk)',
        { cardIds: z.array(z.string()).describe('List of Card IDs to retrieve') },
        async (args) => {
            const parsed = tools.GetCardsSchema.parse(args);
            const result = await tools.handleGetCards(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'search_cards',
        'Search cards by content, tags, or date. Returns rich results with deckId, createdAt, updatedAt. Includes scannedCount and truncated flags.',
        {
            query: z.string().optional().describe('Text to search in card content'),
            deckId: z.string().optional().describe('Deck ID (optional - searches all decks if omitted)'),
            tags: z.array(z.string()).optional().describe('Filter by tags (all must match)'),
            createdAfter: z.string().optional().describe('Filter cards created on or after this date (ISO 8601 UTC format). For "today" or "yesterday", calculate and pass the date.'),
            createdBefore: z.string().optional().describe('Filter cards created before this date (ISO 8601 UTC format)'),
            limit: z.number().optional().describe('Max results (default 20, max 50)'),
        },
        async (args) => {
            const parsed = tools.SearchCardsSchema.parse(args);
            const result = await tools.handleSearchCards(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'list_cards_page',
        'Fetch a single page of cards with explicit pagination. Use for iterating through large collections.',
        {
            deckId: z.string().optional().describe('Deck ID (optional - lists from all decks if omitted)'),
            bookmark: z.string().optional().describe('Pagination cursor from previous response'),
            pageSize: z.number().optional().describe('Cards per page (default 50, max 100)'),
        },
        async (args) => {
            const parsed = tools.ListCardsPageSchema.parse(args);
            const result = await tools.handleListCardsPage(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'find_deck_by_name',
        'Find decks by name (case-insensitive partial match). Useful when you know the deck name but not its ID.',
        {
            query: z.string().describe('Name or partial name to search for'),
        },
        async (args) => {
            const parsed = tools.FindDeckByNameSchema.parse(args);
            const result = await tools.handleFindDeckByName(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'add_tags_preview',
        'Preview adding tags to one or more cards. Returns a token for apply_tags_update.',
        {
            cardIds: z.array(z.string()).describe('Card IDs to add tags to'),
            tagsToAdd: z.array(z.string()).describe('Tags to add'),
        },
        async (args) => {
            const parsed = tools.AddTagsPreviewSchema.parse(args);
            const result = await tools.handleAddTagsPreview(client, config, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'remove_tags_preview',
        'Preview removing tags from one or more cards. Returns a token for apply_tags_update.',
        {
            cardIds: z.array(z.string()).describe('Card IDs to remove tags from'),
            tagsToRemove: z.array(z.string()).describe('Tags to remove'),
        },
        async (args) => {
            const parsed = tools.RemoveTagsPreviewSchema.parse(args);
            const result = await tools.handleRemoveTagsPreview(client, config, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'apply_tags_update',
        'Apply tag changes after user confirms. Use with token from add_tags_preview or remove_tags_preview.',
        {
            token: z.string().describe('Token from add_tags_preview or remove_tags_preview'),
            confirmation: z.string().describe('Must be exactly: "confirm tags"'),
        },
        async (args) => {
            const parsed = tools.ApplyTagsUpdateSchema.parse(args);
            const result = await tools.handleApplyTagsUpdate(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    // ==========================================================================
    // Card Creation (Two-Phase)
    // ==========================================================================

    server.tool(
        'create_card_preview',
        'Preview a new card. IMPORTANT: After calling this, you MUST show the preview to the user and ask for explicit confirmation before calling apply_create_card. Do NOT chain these calls automatically.',
        {
            deckId: z.string().describe('Deck ID to create card in'),
            content: z.string().describe('Markdown content for the card'),
            tags: z.array(z.string()).optional().describe('Tags to add'),
        },
        async (args) => {
            const parsed = tools.CreateCardPreviewSchema.parse(args);
            const result = await tools.handleCreateCardPreview(client, config, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'apply_create_card',
        'Execute card creation after user confirms',
        {
            token: z.string().describe('Token from create_card_preview'),
            confirmation: z.string().describe('User must type exactly: "confirm create"'),
        },
        async (args) => {
            const parsed = tools.ApplyCreateCardSchema.parse(args);
            const result = await tools.handleApplyCreateCard(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    // ==========================================================================
    // Card Update (Two-Phase)
    // ==========================================================================

    server.tool(
        'update_card_preview',
        'Preview changes to a card with diff. IMPORTANT: After calling this, you MUST show the diff to the user and ask "Do you want to apply this change?" WAIT for explicit confirmation before calling apply_update_card.',
        {
            cardId: z.string().describe('Card ID to update'),
            content: z.string().describe('New markdown content'),
            tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
        },
        async (args) => {
            const parsed = tools.UpdateCardPreviewSchema.parse(args);
            const result = await tools.handleUpdateCardPreview(client, config, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'update_card_fields_preview',
        'Preview changes to specific fields (Question, Answer, Tags). Reconstructs full markdown.',
        {
            cardId: z.string().describe('Card ID to update'),
            question: z.string().optional().describe('New question text'),
            answer: z.string().optional().describe('New answer text'),
            tags: z.array(z.string()).optional().describe('New tags'),
        },
        async (args) => {
            const parsed = tools.UpdateCardFieldsPreviewSchema.parse(args);
            const result = await tools.handleUpdateCardFieldsPreview(client, config, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'update_cards_batch_preview',
        'Preview updates for multiple cards at once.',
        {
            updates: z.array(z.object({
                cardId: z.string(),
                content: z.string(),
                tags: z.array(z.string()).optional(),
            })).describe('List of updates'),
        },
        async (args) => {
            const parsed = tools.UpdateCardsBatchPreviewSchema.parse(args);
            const result = await tools.handleUpdateCardsBatchPreview(client, config, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'apply_update_cards_batch',
        'Apply a batch of card updates.',
        {
            token: z.string().describe('Token from update_cards_batch_preview'),
            confirmation: z.string().describe('Must be exactly: "confirm batch update"'),
        },
        async (args) => {
            const parsed = tools.ApplyUpdateCardsBatchSchema.parse(args);
            const result = await tools.handleApplyUpdateCardsBatch(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'apply_update_card',
        'Execute card update after user confirms',
        {
            token: z.string().describe('Token from update_card_preview'),
            confirmation: z.string().describe('User must type exactly: "confirm update"'),
        },
        async (args) => {
            const parsed = tools.ApplyUpdateCardSchema.parse(args);
            const result = await tools.handleApplyUpdateCard(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    // ==========================================================================
    // Card Deletion (Typed Confirmation)
    // ==========================================================================

    server.tool(
        'delete_card',
        'Delete a card (soft-delete by default). Requires typed confirmation.',
        {
            cardId: z.string().describe('Card ID to delete'),
            confirmation: z.string().describe('Must be exactly: "delete card <cardId>"'),
            permanent: z.boolean().optional().describe('Hard delete - cannot be undone'),
        },
        async (args) => {
            const parsed = tools.DeleteCardSchema.parse(args);
            const result = await tools.handleDeleteCard(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    // ==========================================================================
    // Deck Operations
    // ==========================================================================

    server.tool(
        'create_deck',
        'Create a new deck',
        {
            name: z.string().describe('Name for the deck'),
            parentId: z.string().optional().describe('Parent deck ID for nesting'),
        },
        async (args) => {
            const parsed = tools.CreateDeckSchema.parse(args);
            const result = await tools.handleCreateDeck(client, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    server.tool(
        'delete_deck',
        'Delete a deck (disabled by default, requires MOCHI_ALLOW_DECK_DELETE=true)',
        {
            deckId: z.string().describe('Deck ID to delete'),
            confirmation: z.string().describe('Must be exactly: "delete deck <deckName>"'),
        },
        async (args) => {
            const parsed = tools.DeleteDeckSchema.parse(args);
            const result = await tools.handleDeleteDeck(client, config, parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
    );

    return server;
}
