#!/usr/bin/env node
/**
 * Mochi MCP Server Entry Point
 * 
 * Run with: MOCHI_API_KEY=your_key node dist/index.js
 * Or for development: MOCHI_API_KEY=your_key npm run dev
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
    try {
        // Load configuration
        const config = loadConfig();

        // Create server
        const server = createServer(config);

        // Connect to stdio transport
        const transport = new StdioServerTransport();
        await server.connect(transport);

        // Log to stderr (stdio transport uses stdout for protocol)
        console.error('Mochi MCP server started');
        console.error(`Deck deletion: ${config.allowDeckDelete ? 'ENABLED' : 'disabled'}`);

    } catch (error) {
        console.error('Failed to start Mochi MCP server:', error);
        process.exit(1);
    }
}

main();
