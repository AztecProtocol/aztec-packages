/**
 * Fetches an account proof from the Ethereum mainnet and saves it as account_proof.json.
 * This script is not using any Aztec library code, so it's easily portable.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, fromRlp, hexToBytes, http } from 'viem';
import { mainnet } from 'viem/chains';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL;
const ADDRESS = (process.env.ADDRESS || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045') as `0x${string}`;
const BLOCK_TAG = process.env.BLOCK_NUMBER ? BigInt(process.env.BLOCK_NUMBER) : 'latest';
const MAX_ACCOUNT_PATH = 15;

function padTo(arr: number[], len: number) {
  return [...arr, ...Array(len - arr.length).fill(0)].slice(0, len);
}

function toBytes(hex: `0x${string}`) {
  return Array.from(hexToBytes(hex));
}

function bytesToU64s(bytes: number[]) {
  const paddedBytes = padTo(bytes, 32);
  return Array.from({ length: 4 }, (_, i) => {
    let val = 0n;
    for (let j = 0; j < 8; j++) {
      val += BigInt(paddedBytes[i * 8 + j]) << BigInt(j * 8);
    }
    return val.toString();
  });
}

function toBytesAndLen(val: bigint | number) {
  if (val === 0n || val === 0) {
    return { bytes: [0], length: 0 };
  }
  let hex = val.toString(16);
  if (hex.length % 2) {
    hex = '0' + hex;
  }
  const bytes = toBytes(`0x${hex}`);
  return { bytes, length: bytes.length };
}

function parseNode(rlp: `0x${string}`) {
  // Should be safe when working with branches and extensions without embedded children.
  const decoded = fromRlp(rlp) as `0x${string}`[];
  const node = {
    rows: Array(16)
      .fill(0)
      .map(() => Array(32).fill(0)),
    row_exist: Array(16).fill(false),
    node_type: 0,
  };

  if (decoded.length === 17) {
    for (let i = 0; i < 16; i++) {
      if (decoded[i] !== '0x') {
        node.row_exist[i] = true;
        node.rows[i] = padTo(toBytes(decoded[i]), 32);
      }
    }
  } else if (decoded.length === 2) {
    const keyBytes = toBytes(decoded[0]);
    const prefix = keyBytes[0];
    if (prefix >> 4 >= 2) {
      throw new Error('Unsupported: leaf node in proof path');
    }
    node.node_type = 1;
    // Extension header format expected by the noir code: check out storage_proof types.nr.
    node.rows[0][0] = prefix >> 4;
    node.rows[0][8] = prefix & 0x0f;
    node.rows[0][16] = keyBytes.length - 1;

    for (let i = 1; i < keyBytes.length && i < 32; i++) {
      node.rows[1][i - 1] = keyBytes[i];
    }
    node.rows[2] = padTo(toBytes(decoded[1]), 32);
    node.row_exist[0] = node.row_exist[1] = node.row_exist[2] = true;
  }
  return node;
}

function parseProof(proof: `0x${string}`[], maxLen: number) {
  const nodes = proof.slice(0, -1).slice(0, maxLen).map(parseNode);
  while (nodes.length < maxLen) {
    nodes.push({
      rows: Array(16)
        .fill(0)
        .map(() => Array(32).fill(0)),
      row_exist: Array(16).fill(false),
      node_type: 0,
    });
  }
  return nodes;
}

function nodeToLibFormat(node: { rows: number[][]; row_exist: boolean[]; node_type: number }) {
  return {
    rows: node.rows.map(bytesToU64s),
    row_exist: node.row_exist,
    node_type: String(node.node_type),
  };
}

async function main() {
  if (!RPC_URL) {
    throw new Error('RPC_URL is not set');
  }
  console.log(`Fetching account proof for ${ADDRESS}`);

  const client = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
  });

  const [blockNumber, proof, block] = await Promise.all([
    client.getBlockNumber(),
    client.getProof({
      address: ADDRESS,
      storageKeys: [],
      blockNumber: BLOCK_TAG === 'latest' ? undefined : BLOCK_TAG,
    }),
    client.getBlock({
      blockNumber: BLOCK_TAG === 'latest' ? undefined : BLOCK_TAG,
    }),
  ]);

  console.log(`Block: ${blockNumber}, Account nodes: ${proof.accountProof.length}`);

  // The -1 is because the last node in the proof is the leaf, which is excluded from path verification.
  const accountPathLen = proof.accountProof.length - 1;
  if (accountPathLen > MAX_ACCOUNT_PATH) {
    throw new Error(
      `Account proof path length ${accountPathLen} exceeds MAX_ACCOUNT_PATH ${MAX_ACCOUNT_PATH}. Increase the limit.`,
    );
  }

  const nonce = toBytesAndLen(proof.nonce);
  const balance = toBytesAndLen(proof.balance);

  const data = {
    block_number: String(blockNumber),
    node_length: String(accountPathLen),
    root: bytesToU64s(toBytes(block.stateRoot)),
    nodes: parseProof(proof.accountProof, MAX_ACCOUNT_PATH).map(nodeToLibFormat),
    account: {
      address: toBytes(ADDRESS).map(String),
      balance: padTo(balance.bytes, 32).map(String),
      balance_length: String(balance.length),
      code_hash: bytesToU64s(toBytes(proof.codeHash)),
      nonce: padTo(nonce.bytes, 8).map(String),
      nonce_length: String(nonce.length),
      storage_hash: bytesToU64s(toBytes(proof.storageHash)),
    },
  };

  fs.writeFileSync(join(__dirname, 'account_proof.json'), JSON.stringify(data, null, 2));
  console.log('account_proof.json generated');
}

main().catch(console.error);
