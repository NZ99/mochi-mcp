import { MochiClient } from './dist/mochi-client.js';

const client = new MochiClient({
    apiKey: process.env.MOCHI_API_KEY,
    apiBaseUrl: 'https://app.mochi.cards/api'
});

console.log('Testing listCards for ai-gen deck...');
const start = Date.now();

client.listCards('naCeWSyU').then(cards => {
    console.log(`Got ${cards.length} cards in ${(Date.now() - start) / 1000}s`);
    const matches = cards.filter(c => c.content.toLowerCase().includes('gradient'));
    console.log(`Found ${matches.length} cards matching "gradient"`);
    if (matches.length > 0) {
        console.log('First match:', matches[0].content.slice(0, 100));
    }
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
