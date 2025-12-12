
import { MochiClient } from './src/mochi-client.js'; // Adjust path if needed
import {
    handleGetCards,
    handleUpdateCardFieldsPreview,
    handleUpdateCardsBatchPreview,
    handleApplyUpdateCardsBatch
} from './src/tools/index.js'; // Adjust path if needed or import directly from files
// Since tools/index.js might not export everything or might be compiled, 
// I'll import directly from the source tools files to be safe in this TS script
import { handleGetCards as execGetCards } from './src/tools/read.js';
import { handleUpdateCardFieldsPreview as execUpdateFields } from './src/tools/write.js';
import { handleUpdateCardsBatchPreview as execBatchPreview, handleApplyUpdateCardsBatch as execBatchApply } from './src/tools/write.js';

// Mock Config
const config = {
    apiKey: '003c1007fec4e2669c8a02e1',
    apiBaseUrl: 'https://app.mochi.cards/api',
    allowDeckDelete: false,
    tokenExpiryMins: 10
};

async function main() {
    console.log('Starting Feature Verification...');
    const client = new MochiClient(config);

    // 1. Test get_cards (Multi-Get)
    // We need valid IDs. Let's list a few first.
    console.log('\n--- Testing Multi-Get ---');
    const recentCards = await client.listCards(undefined, 3);
    if (recentCards.length < 2) {
        console.log('Skipping Multi-Get test (not enough cards)');
    } else {
        const ids = recentCards.map(c => c.id);
        const result = await execGetCards(client, { cardIds: ids });
        console.log(`Requested ${ids.length} cards, got ${result.cards.length}`);
        console.log('First card question:', result.cards[0].question);
        if (result.cards.length === ids.length) console.log('✅ Multi-Get Success');
        else console.error('❌ Multi-Get Failed');
    }

    // 2. Test Field-Level Update Preview
    console.log('\n--- Testing Field-Level Update Preview ---');
    if (recentCards.length > 0) {
        const card = recentCards[0];
        const result = await execUpdateFields(client, config, {
            cardId: card.id,
            question: card.content.split('\n---')[0] + ' [TEST EDIT]'
        });
        console.log('Preview generated:', result.message);
        if (result.diff.includes('[TEST EDIT]')) console.log('✅ Field-Level Preview Success');
        else console.error('❌ Field-Level Preview Failed (Change not reflected)');
    }

    // 3. Test Batch Update Preview
    console.log('\n--- Testing Batch Update Preview ---');
    if (recentCards.length >= 2) {
        const updates = recentCards.slice(0, 2).map(c => ({
            cardId: c.id,
            content: c.content + '\n\n[BATCH VERIFY]'
        }));

        const batchResult = await execBatchPreview(client, config, { updates });
        console.log('Batch Preview generated:', batchResult.message);
        console.log('Token:', batchResult.token);

        if (batchResult.preview.includes('[BATCH VERIFY]')) console.log('✅ Batch Preview Success');
        else console.error('❌ Batch Preview Failed');
    }

    console.log('\nVerification Complete.');
}

main().catch(console.error);
