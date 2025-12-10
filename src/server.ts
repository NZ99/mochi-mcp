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
        'search_cards',
        'Search cards in a specific deck. IMPORTANT: First call list_decks to get deck IDs, then call this with a deckId.',
        {
            query: z.string().optional().describe('Text to search in card content'),
            deckId: z.string().describe('Deck ID (required) - get from list_decks first'),
            tags: z.array(z.string()).optional().describe('Filter by tags (all must match)'),
            limit: z.number().optional().describe('Max results (default 20, max 50)'),
        },
        async (args) => {
            const parsed = tools.SearchCardsSchema.parse(args);
            const result = await tools.handleSearchCards(client, parsed);
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
