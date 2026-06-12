// Connect to a content_shell devtools endpoint over CDP, navigate to a URL,
// and capture EVERY console / log entry verbatim (no logcat truncation).
// Usage: node capture-console.mjs <cdp-endpoint> <navigate-url> <out-file> [timeout-s]
import fs from 'fs';
import { chromium } from 'playwright-core';

const [endpoint, navUrl, outPath, timeoutS = '240'] = process.argv.slice(2);
const lines = [];
const push = l => {
  lines.push(l);
  const head = l.length > 200 ? l.slice(0, 200) + '…' : l;
  console.log(head);
};

const browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
if (!page) throw new Error('no page found over CDP');

const session = await ctx.newCDPSession(page);
await session.send('Runtime.enable');
await session.send('Log.enable');
await session.send('Page.enable');

let done = false;
const markDone = txt => {
  if (/\[probe\] state=(done|error)/.test(txt) || /\[probe\] (\w+) ok=/.test(txt)) done = true;
};
session.on('Runtime.consoleAPICalled', e => {
  const txt = e.args
    .map(a => (a.type === 'string' ? a.value : (a.description ?? JSON.stringify(a.value))))
    .join(' ');
  push(`[console:${e.type}] ${txt}`);
  markDone(txt);
});
session.on('Log.entryAdded', e => {
  push(`[log:${e.entry.source}:${e.entry.level}] ${e.entry.text}`);
  markDone(e.entry.text);
});
session.on('Runtime.exceptionThrown', e => {
  push(`[exception] ${e.exceptionDetails.text} ${e.exceptionDetails.exception?.description ?? ''}`);
});

push(`[capture] connected, navigating to ${navUrl}`);
await session.send('Page.navigate', { url: navUrl });

const deadline = Date.now() + parseInt(timeoutS, 10) * 1000;
while (!done && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 500));
}
// grace period for trailing dump messages
await new Promise(r => setTimeout(r, 3000));

fs.writeFileSync(outPath, lines.join('\n') + '\n');
push(`[capture] wrote ${lines.length} entries to ${outPath} (done=${done})`);
await browser.close().catch(() => {});
process.exit(done ? 0 : 2);
