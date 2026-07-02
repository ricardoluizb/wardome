// web/client.js
const output = document.getElementById('output');
const roomIdEl = document.getElementById('room-id');
const form = document.getElementById('input-form');
const input = document.getElementById('command-input');

const ws = new WebSocket('ws://localhost:8080');

function stripAnsi(text) {
  // Strip ANSI escape codes for this milestone; color rendering is a later task.
  // Also strip raw Telnet IAC negotiation sequences (e.g. IAC WILL/WONT/DO/DONT ECHO)
  // that the bridge passes through unmodified; without this they render as garbage
  // characters around prompts like "Password:". Real password masking (switching the
  // input to type="password" based on server echo state) is out of scope here and is
  // deferred alongside the ANSI-color work.
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\xff[\xfb-\xfe]./g, '');
}

ws.addEventListener('open', () => {
  output.textContent += '[connected to Wardome]\n';
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'text') {
    output.textContent += stripAnsi(msg.data);
    output.scrollTop = output.scrollHeight;
  } else if (msg.type === 'room') {
    roomIdEl.textContent = msg.id;
  }
});

ws.addEventListener('close', () => {
  output.textContent += '\n[disconnected]\n';
});

ws.addEventListener('error', () => {
  output.textContent += '\n[connection error]\n';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const command = input.value;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cmd', data: command }));
  }
  input.value = '';
});
