#!/usr/bin/env node
// bridge.mjs — Persistent Node.js HTTP bridge for the Aztec protocol fuzzer.
//
// Runs inside the nightly sandbox container at /usr/src/yarn-project/.
// Reuses the CLI wallet's own CLIWallet class so we get identical behavior
// to `aztec-wallet` without the ~1.5s cold-start per invocation.
//
// All addresses arrive pre-resolved (raw 0x hex strings) — the Rust fuzzer
// keeps its own address book and resolves aliases before calling the bridge.
//
// Endpoints:
//   POST /import-test-accounts  — import deterministic test wallets, returns addresses
//   POST /deploy                — deploy a contract artifact, returns deployed address
//   POST /execute               — send or simulate a contract method
//   GET  /health                — liveness check

import { createServer } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { format } from 'node:util';

const PORT = parseInt(process.env.BRIDGE_PORT || '8089', 10);
const NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
const DATA_DIR = process.env.WALLET_DATA_DIRECTORY || join(homedir(), '.aztec/wallet');

// ---- SDK imports -----------------------------------------------------------

const { createAztecNodeClient } = await import('@aztec/aztec.js/node');
const { AztecAddress } = await import('@aztec/aztec.js/addresses');
const { openStoreAt } = await import('@aztec/kv-store/lmdb-v2');
const { CLIWallet } = await import(
  '/usr/src/yarn-project/cli-wallet/dest/utils/wallet.js'
);
const { WalletDB } = await import(
  '/usr/src/yarn-project/cli-wallet/dest/storage/wallet_db.js'
);
const { importTestAccounts } = await import(
  '/usr/src/yarn-project/cli-wallet/dest/cmds/import_test_accounts.js'
);
const { send: cliSend } = await import(
  '/usr/src/yarn-project/cli-wallet/dest/cmds/send.js'
);
const { simulate: cliSimulate } = await import(
  '/usr/src/yarn-project/cli-wallet/dest/cmds/simulate.js'
);
const { deploy: cliDeploy } = await import(
  '/usr/src/yarn-project/cli-wallet/dest/cmds/deploy.js'
);

// ---- Initialize CLIWallet (once) -------------------------------------------

const noop = () => {};
let logCapture = [];
const capturingLog = (...args) => { logCapture.push(format(...args)); };

const node = createAztecNodeClient(NODE_URL);
const db = WalletDB.getInstance();

let wallet = null;

async function ensureWallet(prove = false) {
  if (wallet) return wallet;
  wallet = await CLIWallet.create(node, noop, db, {
    proverEnabled: prove,
    dataDirectory: join(DATA_DIR, 'pxe'),
  });
  await db.init(await openStoreAt(DATA_DIR));
  console.log(`CLIWallet ready (prove=${prove})`);
  return wallet;
}

// ---- Fee stub --------------------------------------------------------------

const stubFeeOpts = {
  estimateOnly: false,
  toUserFeeOptions: async () => ({
    paymentMethod: undefined,
    gasSettings: undefined,
  }),
};

// ---- Handlers --------------------------------------------------------------

async function handleImportTestAccounts({ prove }) {
  const w = await ensureWallet(prove ?? false);
  logCapture = [];
  await importTestAccounts(w, db, false, capturingLog);

  // Parse account addresses from the log output (more reliable than alias cache).
  // importTestAccounts logs lines like:  Address:  0x09ece2d3...
  const stdout = logCapture.join('\n');
  const accounts = [...stdout.matchAll(/Address:\s+(0x[0-9a-fA-F]+)/g)]
    .map(m => m[1]);

  return { ok: true, accounts, stdout };
}

async function handleDeploy({ artifact, from, init: initMethod, args: rawArgs }) {
  const w = await ensureWallet();
  const fromAddr = AztecAddress.fromString(from);
  const argsArray = Array.isArray(rawArgs) ? rawArgs : [];

  logCapture = [];
  const deployedAddr = await cliDeploy(
    w, node, fromAddr, artifact, false, /* json */
    undefined, /* publicKeys */
    argsArray,
    undefined, /* salt */
    initMethod ?? 'constructor',
    false, /* skipInstancePublication */
    false, /* skipClassPublication */
    !initMethod, /* skipInitialization */
    true,  /* wait */
    stubFeeOpts,
    false, /* verbose */
    120,   /* timeout */
    { debug: noop, error: noop },
    capturingLog,
  );

  return {
    ok: true,
    address: deployedAddr.toString(),
    stdout: logCapture.join('\n'),
  };
}

async function handleExecute({ verb, method, contract, from, args, artifact }) {
  const w = await ensureWallet();
  const fromAddr = AztecAddress.fromString(from);
  const contractAddr = AztecAddress.fromString(contract);
  const argsArray = args || [];

  logCapture = [];

  if (verb === 'send') {
    await cliSend(
      w, node, fromAddr, method, argsArray,
      artifact, contractAddr,
      true,  /* wait */
      false, /* cancellable */
      stubFeeOpts,
      [],    /* authWitnesses */
      false, /* verbose */
      capturingLog,
    );
  } else {
    await cliSimulate(
      w, node, fromAddr, method, argsArray,
      artifact, contractAddr,
      stubFeeOpts,
      [],    /* authWitnesses */
      false, /* verbose */
      capturingLog,
    );
  }

  return { ok: true, stdout: logCapture.join('\n') };
}

// ---- HTTP Server -----------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  const body = await readBody(req);
  const json = body ? JSON.parse(body) : {};
  let result;

  try {
    switch (req.url) {
      case '/import-test-accounts':
        result = await handleImportTestAccounts(json);
        break;
      case '/deploy':
        result = await handleDeploy(json);
        break;
      case '/execute':
        result = await handleExecute(json);
        break;
      default:
        res.writeHead(404);
        res.end(`Unknown endpoint: ${req.url}`);
        return;
    }
  } catch (err) {
    result = { ok: false, error: err.message || String(err) };
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

// ---- Start -----------------------------------------------------------------

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Bridge listening on port ${PORT}`);
});
