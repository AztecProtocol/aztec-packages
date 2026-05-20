const logEl = document.querySelector('#log');
const form = document.querySelector('#bench-form');
const runButton = document.querySelector('#run');

function appendLog(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  logEl.textContent += `${text}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function decodeBenchParam(raw) {
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0))));
}

async function postJson(path, body) {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Posting progress to the local harness is best effort.
  }
}

async function run(options) {
  runButton.disabled = true;
  logEl.textContent = '';
  window.__wasmBenchStatus = { state: 'running', options };
  window.__wasmBenchResult = undefined;
  window.__wasmBenchError = undefined;

  const worker = new Worker(new URL('./bench-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = async event => {
    const message = event.data;
    if (message.type === 'progress') {
      const row = { ...message, options };
      window.__wasmBenchStatus = { state: 'progress', event: message.event, data: message.data };
      appendLog(row);
      await postJson('/progress', row);
      return;
    }

    if (message.type === 'result') {
      window.__wasmBenchStatus = { state: 'complete' };
      window.__wasmBenchResult = message.result;
      appendLog(message.result);
      await postJson('/result', message.result);
      worker.terminate();
      runButton.disabled = false;
      return;
    }

    if (message.type === 'error') {
      window.__wasmBenchStatus = { state: 'error', error: message.error };
      window.__wasmBenchError = message.error;
      appendLog(message.error);
      await postJson('/progress', { type: 'error', error: message.error, options });
      worker.terminate();
      runButton.disabled = false;
    }
  };
  worker.onerror = async event => {
    const error = { message: event.message, stack: event.error?.stack ?? '' };
    window.__wasmBenchStatus = { state: 'error', error };
    window.__wasmBenchError = error;
    appendLog(error);
    await postJson('/progress', { type: 'error', error, options });
    worker.terminate();
    runButton.disabled = false;
  };
  worker.postMessage({ type: 'run', options });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(form);
  void run({
    flow: String(formData.get('flow')),
    threads: String(formData.get('threads')),
    runs: Number(formData.get('runs')),
    smoke: String(formData.get('smoke')) === 'true',
  });
});

const params = new URLSearchParams(location.search);
const benchParam = params.get('bench');
if (benchParam) {
  void run(decodeBenchParam(benchParam));
}
