// bridge/test-client.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('[test-client] connected to bridge');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'text') {
    process.stdout.write(msg.data);
  } else if (msg.type === 'room') {
    console.log(`\n[test-client] ROOM TAG RECEIVED: ${msg.id}\n`);
  }
});

ws.on('close', () => console.log('[test-client] disconnected'));
ws.on('error', (err) => console.error('[test-client] error:', err.message));

// Send a command 3 seconds after connecting, e.g. to test the name prompt.
// Adjust the command/timing manually while smoke-testing.
setTimeout(() => {
  ws.send(JSON.stringify({ type: 'cmd', data: 'quit' }));
}, 3000);
