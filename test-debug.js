import { MochiClient } from './dist/mochi-client.js';

// Monkey-patch fetch to add logging
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    console.log('FETCH:', url);
    const start = Date.now();
    try {
        const result = await originalFetch(url, options);
        console.log(`FETCH DONE: ${result.status} in ${Date.now() - start}ms`);
        return result;
    } catch (err) {
        console.error(`FETCH ERROR after ${Date.now() - start}ms:`, err);
        throw err;
    }
};

const client = new MochiClient({
    apiKey: process.env.MOCHI_API_KEY,
    apiBaseUrl: 'https://app.mochi.cards/api'
});

console.log('Testing listCards...');
client.listCards('naCeWSyU').then(cards => {
    console.log(`Got ${cards.length} cards`);
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
