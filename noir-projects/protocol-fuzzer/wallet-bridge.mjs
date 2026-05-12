#!/usr/bin/env node
// wallet-bridge.mjs -- Persistent HTTP bridge for the Aztec protocol fuzzer.
//
// Works both inside the nightly sandbox container and on the host against a
// locally-built yarn-project. The CLI path is auto-detected: if the container
// path exists we use it, otherwise we resolve relative to the repo root.
// For @aztec/* imports to resolve, either run from yarn-project/ (Docker path)
// or have a node_modules symlink alongside this file pointing to
// yarn-project/node_modules (local setup -- see setup-local.sh).
// All addresses arrive as raw 0x hex strings (resolved by the Rust fuzzer).

import { createServer } from 'node:http';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { format } from 'node:util';
import { fileURLToPath } from 'node:url';

const PORT = parseInt(process.env.BRIDGE_PORT || '8089', 10);
const NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
const DATA_DIR = process.env.WALLET_DATA_DIRECTORY || join(homedir(), '.aztec/wallet');

const { createAztecNodeClient } = await import('@aztec/aztec.js/node');
const { AztecAddress } = await import('@aztec/aztec.js/addresses');
const { openStoreAt } = await import('@aztec/kv-store/lmdb-v2');
const { TxHash } = await import('@aztec/stdlib/tx');
const { Fr } = await import('@aztec/foundation/curves/bn254');
const { EthAddress } = await import('@aztec/foundation/eth-address');
const { computeSiloedPrivateLogFirstField, computeL2ToL1MessageHash } = await import('@aztec/stdlib/hash');
const { SiloedTag } = await import('@aztec/stdlib/logs');

// Auto-detect CLI path: try container path, then common local locations.
const __dirname = dirname(fileURLToPath(import.meta.url));
const candidates = [
  '/usr/src/yarn-project/cli-wallet/dest', // nightly container
  resolve(__dirname, 'cli-wallet/dest'), // symlinked into yarn-project/
  resolve(__dirname, '../../yarn-project/cli-wallet/dest'), // original location in protocol-fuzzer/
];
const CLI = candidates.find(p => existsSync(p));
if (!CLI) throw new Error('Cannot find cli-wallet/dest in any known location');
const { CLIWallet } = await import(`${CLI}/utils/wallet.js`);
const { WalletDB } = await import(`${CLI}/storage/wallet_db.js`);
const { importTestAccounts } = await import(`${CLI}/cmds/import_test_accounts.js`);
const { send } = await import(`${CLI}/cmds/send.js`);
const { simulate } = await import(`${CLI}/cmds/simulate.js`);
const { deploy } = await import(`${CLI}/cmds/deploy.js`);

// Wallet -- lazy-initialized on first request so --prove can be forwarded.
// Only /import-test-accounts passes `prove` through; /deploy and /execute
// rely on the wallet already existing with the right prover setting, so the
// client must call /import-test-accounts first (the Rust fuzzer does this in
// `new_system`).
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
  toUserFeeOptions: async () => ({
    paymentMethod: undefined,
    gasSettings: undefined,
  }),
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
        w,
        node,
        AztecAddress.fromString(from),
        artifact,
        false /* json */,
        undefined /* publicKeys */,
        Array.isArray(args) ? args : [] /* args */,
        undefined /* salt */,
        initMethod ?? 'constructor' /* init */,
        false /* skipInstancePublication */,
        false /* skipClassPublication */,
        false /* skipInitialization */,
        true /* wait */,
        feeOpts /* fee */,
        'mined' /* waitForStatus */,
        false,
        120 /* verbose, timeout */,
        { debug: noop, error: noop },
        log /* debugLogger, log */,
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
        ? send(w, node, sender, method, callArgs, artifact, target, true, false, feeOpts, [], 'mined', false, log)
        : simulate(w, node, sender, method, callArgs, artifact, target, feeOpts, [], false, log),
    );
    const result = { ok: true, stdout };

    // For sends, extract TxEffect data for verification in the fuzzer.
    if (verb === 'send') {
      const hashMatch = stdout.match(/Transaction hash:\s+(0x[a-f0-9]+)/i);
      if (hashMatch) {
        try {
          const effect = await node.getTxEffect(TxHash.fromString(hashMatch[1]));
          if (effect) {
            const d = effect.data;
            result.txEffects = {
              l2ToL1Msgs: d.l2ToL1Msgs.filter(m => !m.isZero()).map(m => m.toBigInt().toString()),
            };
          }
        } catch (err) {
          console.warn('Failed to fetch TxEffect:', err.message);
        }
      }
    }

    return result;
  },

  '/query-private-logs': async ({ contract, rawTag }) => {
    const contractAddr = AztecAddress.fromString(contract);
    const tagFr = new Fr(BigInt(rawTag));
    const siloedFr = await computeSiloedPrivateLogFirstField(contractAddr, tagFr);
    const siloedTag = new SiloedTag(siloedFr);

    const results = await node.getPrivateLogsByTags([siloedTag]);
    const logs = (results[0] || []).map(log => ({
      logData: log.logData.map(f => f.toBigInt().toString()),
    }));

    return { ok: true, siloedTag: siloedFr.toBigInt().toString(), logs };
  },

  '/compute-l2-to-l1-hash': async ({ l2Sender, l1Recipient, content }) => {
    const chainId = new Fr(await node.getChainId());
    const rollupVersion = new Fr(await node.getVersion());
    const hash = computeL2ToL1MessageHash({
      l2Sender: AztecAddress.fromString(l2Sender),
      l1Recipient: EthAddress.fromField(new Fr(BigInt(l1Recipient))),
      content: new Fr(BigInt(content)),
      rollupVersion,
      chainId,
    });

    return { ok: true, hash: hash.toBigInt().toString() };
  },
};

// HTTP server

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => (data += chunk));
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
