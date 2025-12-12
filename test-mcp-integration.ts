
import { spawn } from 'child_process';
import * as readline from 'readline';

// Configuration
const SERVER_CMD = 'npx';
const SERVER_ARGS = ['tsx', 'src/index.ts'];

async function runTest() {
    console.log('--- Starting MCP Integration Test ---');

    // Spawn the server
    const serverProcess = spawn(SERVER_CMD, SERVER_ARGS, {
        cwd: process.cwd(),
        env: { ...process.env, MOCHI_API_KEY: '003c1007fec4e2669c8a02e1' } // Ensure API key is present
    });

    const reader = readline.createInterface({ input: serverProcess.stdout });
    const writer = (msg: object) => {
        const str = JSON.stringify(msg) + '\n';
        serverProcess.stdin.write(str);
    };

    // Helper to send request and await response
    const sendRequest = (method: string, params?: object, id: number = 1): Promise<any> => {
        return new Promise((resolve, reject) => {
            const request = { jsonrpc: '2.0', method, params, id };
            console.log(`\n> Sending ${method} (ID: ${id})`);

            // We need a one-off listener for the response with matching ID
            const listener = (line: string) => {
                try {
                    const response = JSON.parse(line);
                    if (response.id === id) {
                        // Found our response
                        // Remove listener? Ideally yes, but multiple listeners on readline might be messy.
                        // For this simple sequential script, we can just process lines.
                        // But since readline is persistent, we might need a better way.
                        // ACTUALLY: Let's simpler approach: Use a shared message handler.
                    }
                } catch (e) {
                    // Ignore non-json
                }
            };
            // This async flow with readline is tricky. Let's do a simple generic message queue.
        });
    };

    // SIMPLIFIED APPROACH:
    // We will just listen to ALL stdout, parse JSON-RPC, and resolve pending promises.
    const pendingRequests = new Map<number, (response: any) => void>();

    reader.on('line', (line) => {
        try {
            // console.log('< ' + line); // Debug raw output
            const msg = JSON.parse(line);
            if (msg.id !== undefined && pendingRequests.has(msg.id)) {
                pendingRequests.get(msg.id)!(msg);
                pendingRequests.delete(msg.id);
            } else if (msg.method) {
                // Notification or request from server -> ignore for now
                // console.log('Server Notification:', msg.method);
            }
        } catch (e) {
            // console.log('Non-JSON Output:', line);
        }
    });

    serverProcess.stderr.on('data', (data) => console.error('STDERR:', data.toString()));

    const callTool = async (name: string, args: object) => {
        const id = Math.floor(Math.random() * 100000);
        const promise = new Promise<any>((resolve) => pendingRequests.set(id, resolve));

        writer({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name, arguments: args },
            id
        });

        const response = await promise;
        if (response.error) throw new Error(`Tool Error: ${JSON.stringify(response.error)}`);
        return JSON.parse(response.result.content[0].text);
    };

    const listTools = async () => {
        const id = Math.floor(Math.random() * 100000);
        const promise = new Promise<any>((resolve) => pendingRequests.set(id, resolve));
        writer({ jsonrpc: '2.0', method: 'tools/list', id });
        const response = await promise;
        return response.result.tools;
    };

    const listPrompts = async () => {
        const id = Math.floor(Math.random() * 100000);
        const promise = new Promise<any>((resolve) => pendingRequests.set(id, resolve));
        writer({ jsonrpc: '2.0', method: 'prompts/list', id });
        const response = await promise;
        return response.result.prompts;
    };

    try {
        // 0. Wait for server to start (simple timeout or handshake?)
        // MCP doesn't send eager hello. The client sends 'initialize'.
        console.log('Initializing...');
        const initId = 1;
        const initStart = new Promise<any>(resolve => pendingRequests.set(initId, resolve));
        writer({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'test-client', version: '1.0' }
            },
            id: initId
        });
        await initStart;

        // Send initialized notification
        writer({ jsonrpc: '2.0', method: 'notifications/initialized' });
        console.log('✅ Initialized');

        // 0.5 Verify Prompts
        console.log('Verifying Prompts...');
        const prompts = await listPrompts();
        const promptNames = prompts.map((p: any) => p.name);
        if (!promptNames.includes('mochi_guide')) throw new Error('Missing prompt: mochi_guide');
        console.log('✅ Agent Guide Prompt Registered');

        // 1. Verify Tool List
        console.log('Verifying Tools...');
        const tools = await listTools();
        const toolNames = tools.map((t: any) => t.name);

        const requiredTools = [
            'get_cards',
            'search_cards',
            'update_card_fields_preview',
            'update_cards_batch_preview',
            'apply_update_cards_batch'
        ];

        const missing = requiredTools.filter(t => !toolNames.includes(t));
        if (missing.length > 0) throw new Error(`Missing tools: ${missing.join(', ')}`);
        console.log('✅ All new tools registered');

        // 2. Test Multi-Get
        // Use list_decks to find a valid deck/cards first?
        // Or just search globally to get IDs.
        console.log('Testing Global Search & Multi-Get...');
        const searchResult = await callTool('search_cards', { query: 'eigenvalue', limit: 2 });
        if (searchResult.totalFound === 0) {
            console.log('⚠️ No cards found for "eigenvalue", skipping deeper tests.');
        } else {
            console.log(`Found ${searchResult.totalFound} cards.`);
            const ids = searchResult.cards.map((c: any) => c.id);

            const multiGetResult = await callTool('get_cards', { cardIds: ids });
            if (multiGetResult.cards.length !== ids.length) throw new Error('Multi-Get count mismatch');
            console.log('✅ Global Search & Multi-Get Working');

            // 3. Test Field Edit
            const targetId = ids[0];
            console.log(`Testing Field Edit on ${targetId}...`);
            const editResult = await callTool('update_card_fields_preview', {
                cardId: targetId,
                question: 'Updated via MCP Integration Test?'
            });
            if (!editResult.diff.includes('Updated via MCP')) throw new Error('Field edit preview failed');
            console.log('✅ Field Edit Preview Working');

            // 4. Test Batch Edit
            console.log('Testing Batch Edit Preview...');
            const batchResult = await callTool('update_cards_batch_preview', {
                updates: [{ cardId: targetId, content: 'Batch content update' }]
            });
            if (!batchResult.token) throw new Error('Batch preview failed to generate token');
            console.log('✅ Batch Preview Working');
        }

        console.log('\nSUCCESS: All integration tests passed.');
        process.exit(0);

    } catch (error) {
        console.error('\nFAILED:', error);
        process.exit(1);
    }
}

runTest();
