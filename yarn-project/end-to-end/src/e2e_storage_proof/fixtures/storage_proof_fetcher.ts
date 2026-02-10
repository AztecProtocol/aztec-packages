/**
 * Fetches a ERC20 balance storage proof from the Ethereum mainnet and saves it to a Prover.toml compatible JSON.
 * The JSON can be converted to toml for use with nargo, or used directly as a JSON file when used in
 * Aztec contracts. This script is not using any Aztec library code, so it's easily portable.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, encodeAbiParameters, fromRlp, hexToBytes, http, keccak256 } from 'viem';
import { mainnet } from 'viem/chains';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL;
const ERC20_CONTRACT = (process.env.ERC20_CONTRACT || '0xdAC17F958D2ee523a2206206994597C13D831ec7') as `0x${string}`;
const HOLDER = (process.env.HOLDER || '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a') as `0x${string}`;
const SLOT = BigInt(process.env.SLOT || '2');
const BLOCK_TAG = process.env.BLOCK_NUMBER ? BigInt(process.env.BLOCK_NUMBER) : 'latest';
const MAX_ACCOUNT_PATH = 15;
const MAX_STORAGE_PATH = 10;

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
  const storageKey = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [HOLDER, SLOT]));
  console.log(`Fetching storage proof for ${ERC20_CONTRACT}, holder ${HOLDER}, slot ${SLOT}`);
  console.log(`Storage key: ${storageKey}`);

  const client = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
  });

  const [blockNumber, proof, block] = await Promise.all([
    client.getBlockNumber(),
    client.getProof({
      address: ERC20_CONTRACT,
      storageKeys: [storageKey],
      blockNumber: BLOCK_TAG === 'latest' ? undefined : BLOCK_TAG,
    }),
    client.getBlock({
      blockNumber: BLOCK_TAG === 'latest' ? undefined : BLOCK_TAG,
    }),
  ]);

  const storageProof = proof.storageProof[0];
  console.log(
    `Block: ${blockNumber}, Account nodes: ${proof.accountProof.length}, Storage nodes: ${storageProof.proof.length}`,
  );
  console.log(`Value: ${storageProof.value}`);

  // The -1 is because the last node in the proof is the leaf, which is excluded from path verification.
  const accountPathLen = proof.accountProof.length - 1;
  const storagePathLen = storageProof.proof.length - 1;
  if (accountPathLen > MAX_ACCOUNT_PATH) {
    throw new Error(
      `Account proof path length ${accountPathLen} exceeds MAX_ACCOUNT_PATH ${MAX_ACCOUNT_PATH}. Increase the limit.`,
    );
  }
  if (storagePathLen > MAX_STORAGE_PATH) {
    throw new Error(
      `Storage proof path length ${storagePathLen} exceeds MAX_STORAGE_PATH ${MAX_STORAGE_PATH}. Increase the limit.`,
    );
  }

  const nonce = toBytesAndLen(proof.nonce);
  const balance = toBytesAndLen(proof.balance);
  const slotValue = toBytesAndLen(storageProof.value);

  const data = {
    account_nodes: parseProof(proof.accountProof, MAX_ACCOUNT_PATH).map(nodeToLibFormat),
    account_node_length: String(accountPathLen),
    storage_nodes: parseProof(storageProof.proof, MAX_STORAGE_PATH).map(nodeToLibFormat),
    storage_node_length: String(storagePathLen),
    account: {
      nonce: padTo(nonce.bytes, 8).map(String),
      nonce_length: String(nonce.length),
      balance: padTo(balance.bytes, 32).map(String),
      balance_length: String(balance.length),
      address: toBytes(ERC20_CONTRACT).map(String),
      storage_hash: bytesToU64s(toBytes(proof.storageHash)),
      code_hash: bytesToU64s(toBytes(proof.codeHash)),
    },
    slot: {
      value: padTo(slotValue.bytes, 32).map(String),
      value_length: String(slotValue.length),
    },
    slot_key: toBytes(storageKey).map(String),
    root: bytesToU64s(toBytes(block.stateRoot)),
    block_number: String(blockNumber),
  };

  fs.writeFileSync(join(__dirname, 'storage_proof.json'), JSON.stringify(data, null, 2));
  console.log('storage_proof.json generated');
}

main().catch(console.error);
