// Simple fetch test - bypass our client
const apiKey = process.env.MOCHI_API_KEY;
const auth = Buffer.from(apiKey + ':').toString('base64');

console.log('Testing direct fetch...');
const start = Date.now();

fetch('https://app.mochi.cards/api/cards/?deck-id=naCeWSyU&limit=10', {
    headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
    }
}).then(r => {
    console.log(`Response status: ${r.status} in ${(Date.now() - start) / 1000}s`);
    return r.json();
}).then(d => {
    console.log(`Got ${d.docs?.length} cards`);
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
