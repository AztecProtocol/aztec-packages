#!/usr/bin/env node
// bridge.mjs -- Persistent HTTP bridge for the Aztec protocol fuzzer.
//
// Runs inside the nightly sandbox container. Reuses CLIWallet to avoid
// the ~1.5s cold-start of spawning a new Node process per call.
// All addresses arrive as raw 0x hex strings (resolved by the Rust fuzzer).

import { createServer } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { format } from 'node:util';

const PORT = parseInt(process.env.BRIDGE_PORT || '8089', 10);
const NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
const DATA_DIR = process.env.WALLET_DATA_DIRECTORY || join(homedir(), '.aztec/wallet');

const { createAztecNodeClient } = await import('@aztec/aztec.js/node');
const { AztecAddress } = await import('@aztec/aztec.js/addresses');
const { openStoreAt } = await import('@aztec/kv-store/lmdb-v2');
const CLI = '/usr/src/yarn-project/cli-wallet/dest';
const { CLIWallet } = await import(`${CLI}/utils/wallet.js`);
const { WalletDB } = await import(`${CLI}/storage/wallet_db.js`);
const { importTestAccounts } = await import(`${CLI}/cmds/import_test_accounts.js`);
const { send } = await import(`${CLI}/cmds/send.js`);
const { simulate } = await import(`${CLI}/cmds/simulate.js`);
const { deploy } = await import(`${CLI}/cmds/deploy.js`);

// Wallet -- lazy-initialized on first request so --prove can be forwarded.
const noop = () => {};
const node = createAztecNodeClient(NODE_URL);
const db = WalletDB.getInstance();
let wallet = null;

async function ensureWallet(prove = false) {
  if (!wallet) {
    wallet = await CLIWallet.create(node, noop, db, {
      proverEnabled: prove,
      dataDirectory: join(DATA_DIR, 'pxe'),
    });
    await db.init(await openStoreAt(DATA_DIR));
    console.log(`CLIWallet ready (prove=${prove})`);
  }
  return wallet;
}

// Run an async operation that accepts a log callback, return its result + captured stdout.
async function capturing(operation) {
  const lines = [];
  const log = (...args) => lines.push(format(...args));
  const result = await operation(log);
  return { result, stdout: lines.join('\n') };
}

const feeOpts = {
  estimateOnly: false,
  toUserFeeOptions: async () => ({ paymentMethod: undefined, gasSettings: undefined }),
};

// Handlers -- each receives the parsed JSON body and returns a result object.

const handlers = {
  '/import-test-accounts': async ({ prove }) => {
    const w = await ensureWallet(prove ?? false);
    const { stdout } = await capturing(log => importTestAccounts(w, db, false, log));
    const accounts = [...stdout.matchAll(/Address:\s+(0x[0-9a-fA-F]+)/g)].map(m => m[1]);
    return { ok: true, accounts, stdout };
  },

  '/deploy': async ({ artifact, from, init: initMethod, args }) => {
    const w = await ensureWallet();
    const { result: address, stdout } = await capturing(log =>
      deploy(
        w, node, AztecAddress.fromString(from), artifact,
        false,                                  /* json */
        undefined,                              /* publicKeys */
        Array.isArray(args) ? args : [],        /* args */
        undefined,                              /* salt */
        initMethod ?? 'constructor',            /* init */
        false,                                  /* skipInstancePublication */
        false,                                  /* skipClassPublication */
        false,                                  /* skipInitialization */
        true,                                   /* wait */
        feeOpts, false, 120,                    /* fee, verbose, timeout */
        { debug: noop, error: noop }, log,      /* debugLogger, log */
      ),
    );
    return { ok: true, address: address.toString(), stdout };
  },

  '/execute': async ({ verb, method, contract, from, args, artifact }) => {
    const w = await ensureWallet();
    const sender = AztecAddress.fromString(from);
    const target = AztecAddress.fromString(contract);
    const callArgs = args || [];
    const { stdout } = await capturing(log =>
      verb === 'send'
        ? send(w, node, sender, method, callArgs, artifact, target, true, false, feeOpts, [], false, log)
        : simulate(w, node, sender, method, callArgs, artifact, target, feeOpts, [], false, log),
    );
    return { ok: true, stdout };
  },
};

// HTTP server

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
  });
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }
  if (req.method !== 'POST' || !handlers[req.url]) {
    res.writeHead(req.method !== 'POST' ? 405 : 404);
    return res.end();
  }
  const body = await readBody(req);
  let result;
  try {
    result = await handlers[req.url](body ? JSON.parse(body) : {});
  } catch (err) {
    result = { ok: false, error: err.message || String(err) };
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}).listen(PORT, () => console.log(`Bridge listening on port ${PORT}`));
