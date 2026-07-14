import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Capsule } from '@aztec/stdlib/tx';

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, './storage_proof.json');

// Constants matching the Noir contract
const ACCOUNT_CAPSULE_KEY_SEPARATOR = 100;
const ACCOUNT_PROOF_CAPSULE_KEY_SEPARATOR = 101;
const STORAGE_PROOF_CAPSULE_KEY_SEPARATOR = 102;
const STORAGE_PROOF_NODE_CAPSULE_KEY_SEPARATOR = 103;
const MAX_ACCOUNT_PROOF_LENGTH = 15;
/** Node: rows [[u64;4];16] (64) + row_exist [bool;16] (16) + node_type u8 (1) = 81 fields */
const NODE_FIELD_COUNT = 81;

// --- JSON fixture types ---

type JsonNode = { rows: string[][]; row_exist: boolean[]; node_type: string };

type JsonAccount = {
  nonce: string[];
  balance: string[];
  address: string[];
  nonce_length: string;
  balance_length: string;
  storage_hash: string[];
  code_hash: string[];
};

type StorageProofJSON = {
  root: string[];
  slot_key: string[];
  account_node_length: string;
  storage_node_length: string;
  account_nodes: JsonNode[];
  storage_nodes: JsonNode[];
  account: JsonAccount;
  slot: { value: string[]; value_length: string };
};

// --- Serialization helpers (Noir struct Serialize layout) ---

function serializeNode(node: JsonNode): Fr[] {
  const fields: Fr[] = [];
  for (const row of node.rows) {
    for (const val of row) {
      fields.push(new Fr(BigInt(val)));
    }
  }
  for (const exists of node.row_exist) {
    fields.push(new Fr(exists ? 1n : 0n));
  }
  fields.push(new Fr(BigInt(node.node_type)));
  return fields;
}

/** Account: nonce [u8;8] + balance [u8;32] + address [u8;20] + nonce_length u8 + balance_length u8 + storage_hash [u64;4] + code_hash [u64;4] = 70 fields */
function serializeAccount(account: JsonAccount): Fr[] {
  const fields: Fr[] = [];
  for (const v of account.nonce) {
    fields.push(new Fr(BigInt(v)));
  }
  for (const v of account.balance) {
    fields.push(new Fr(BigInt(v)));
  }
  for (const v of account.address) {
    fields.push(new Fr(BigInt(v)));
  }
  fields.push(new Fr(BigInt(account.nonce_length)));
  fields.push(new Fr(BigInt(account.balance_length)));
  for (const v of account.storage_hash) {
    fields.push(new Fr(BigInt(v)));
  }
  for (const v of account.code_hash) {
    fields.push(new Fr(BigInt(v)));
  }
  return fields;
}

function zeroNode(): Fr[] {
  return Array(NODE_FIELD_COUNT).fill(Fr.ZERO);
}

// --- Public API ---

/** Parsed + typed fixture data ready for use as contract function arguments. */
export type StorageProofArgs = {
  ethAddress: EthAddress;
  slotKey: number[];
  slotContents: { value: number[]; value_length: number };
  root: bigint[];
};

/** Loads the storage proof fixture from disk and returns the contract args. */
export function loadStorageProofArgs(): StorageProofArgs {
  const fixture: StorageProofJSON = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const addressBytes = Buffer.from(fixture.account.address.map(v => Number(v)));
  return {
    ethAddress: EthAddress.fromString('0x' + addressBytes.toString('hex')),
    slotKey: fixture.slot_key.map(v => Number(v)),
    slotContents: {
      value: fixture.slot.value.map(v => Number(v)),
      // eslint-disable-next-line camelcase
      value_length: Number(fixture.slot.value_length),
    },
    root: fixture.root.map(v => BigInt(v)),
  };
}

/** Builds all the capsules the StorageProofTest contract expects during private execution. */
export async function buildStorageProofCapsules(contractAddress: AztecAddress): Promise<Capsule[]> {
  const fixture: StorageProofJSON = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

  const root = fixture.root.map(v => BigInt(v));
  const slotKey = fixture.slot_key.map(v => Number(v));
  const accountNodeLength = Number(fixture.account_node_length);
  const storageNodeLength = Number(fixture.storage_node_length);
  const ethAddress = EthAddress.fromBuffer(Buffer.from(fixture.account.address.map(v => Number(v))));

  // Compute capsule keys (must match the Noir contract's poseidon2_hash computations)
  const addressCapsuleKey = await poseidon2Hash([
    new Fr(ACCOUNT_CAPSULE_KEY_SEPARATOR),
    ...root.map(v => new Fr(v)),
    ethAddress.toField(),
  ]);

  const accountProofCapsuleKey = await poseidon2Hash([new Fr(ACCOUNT_PROOF_CAPSULE_KEY_SEPARATOR), addressCapsuleKey]);

  const storageProofCapsuleKey = await poseidon2Hash([
    new Fr(STORAGE_PROOF_CAPSULE_KEY_SEPARATOR),
    addressCapsuleKey,
    ...slotKey.map(v => new Fr(v)),
  ]);

  // Build capsule data

  // 1. Account data
  const accountData = serializeAccount(fixture.account);

  // 2. Account proof nodes padded to MAX_ACCOUNT_PROOF_LENGTH
  const accountProofData: Fr[] = [new Fr(accountNodeLength)];
  for (let i = 0; i < MAX_ACCOUNT_PROOF_LENGTH; i++) {
    accountProofData.push(...(i < fixture.account_nodes.length ? serializeNode(fixture.account_nodes[i]) : zeroNode()));
  }

  // 3. Storage proof length (u32)
  const storageProofLengthData = [new Fr(storageNodeLength)];

  const capsules: Capsule[] = [
    new Capsule(contractAddress, addressCapsuleKey, accountData),
    new Capsule(contractAddress, accountProofCapsuleKey, accountProofData),
    new Capsule(contractAddress, storageProofCapsuleKey, storageProofLengthData),
  ];

  // 4. Individual storage node capsules for private recursion.
  for (let i = 0; i < storageNodeLength; i++) {
    const nodeCapsuleKey = await poseidon2Hash([
      new Fr(STORAGE_PROOF_NODE_CAPSULE_KEY_SEPARATOR),
      storageProofCapsuleKey,
      new Fr(i),
    ]);
    capsules.push(new Capsule(contractAddress, nodeCapsuleKey, serializeNode(fixture.storage_nodes[i])));
  }

  return capsules;
}
