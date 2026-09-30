// Tests of the generated @aztec-foundation/wsdb-ref package against one backend, from its build.
// Run through wsdb_ref_test.sh, which sets WSDB_REF_TEST_BACKEND to napi or wasm.
//
// Every napi backend in a process shares one world state (node loads the addon once), so the
// tests read the genesis through committed reads, which writes never change, and write only fresh
// random keys.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { WsdbError, WsdbService, WsdbServiceSync } from '@aztec-foundation/wsdb-ref';

const backend = process.env.WSDB_REF_TEST_BACKEND;
assert.ok(backend === 'napi' || backend === 'wasm', `WSDB_REF_TEST_BACKEND must be napi or wasm, got ${backend}`);

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const constantsNr = readFileSync(
  join(root, 'noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr'),
  'utf8',
);
function protocolConstant(name) {
  const match = constantsNr.match(new RegExp(`pub global ${name}: Field =\\s*(0x[0-9a-f]+);`));
  assert.ok(match, `${name} not found in constants.nr`);
  return BigInt(match[1]);
}

const NULLIFIER_TREE = 0;
const NOTE_HASH_TREE = 1;
const ARCHIVE = 4;
const LATEST = 0xffffffff;
const committed = { forkId: 0, blockNumber: LATEST, includeUncommitted: false };
const uncommitted = { forkId: 0, blockNumber: LATEST, includeUncommitted: true };

const toBigInt = bytes => BigInt('0x' + Buffer.from(bytes).toString('hex'));
// A random field element: 31 random bytes stay below the modulus.
const randomFr = () => new Uint8Array([0, ...randomBytes(31)]);

let service;
before(async () => {
  service = await WsdbService.create({ backend });
});
after(async () => {
  await service.destroy();
});

test('serves the canonical genesis', async () => {
  const nullifiers = await service.getTreeInfo({ treeId: NULLIFIER_TREE, revision: committed });
  assert.equal(toBigInt(nullifiers.root), protocolConstant('GENESIS_NULLIFIER_TREE_ROOT'));
  assert.equal(nullifiers.size, 128);

  const archive = await service.getTreeInfo({ treeId: ARCHIVE, revision: committed });
  assert.equal(toBigInt(archive.root), protocolConstant('GENESIS_ARCHIVE_ROOT'));
  assert.equal(archive.size, 1);

  const header = await service.getLeafValue({ treeId: ARCHIVE, revision: committed, leafIndex: 0 });
  assert.equal(toBigInt(header.value), protocolConstant('GENESIS_BLOCK_HEADER_HASH'));

  const { state } = await service.getInitialStateReference({});
  assert.deepEqual(state.map(t => t.treeId).sort(), [0, 1, 2, 3]);
});

test('appended leaves are read back with membership witnesses', async () => {
  const leaf = randomFr();
  await service.appendLeaves({ treeId: NOTE_HASH_TREE, leaves: [leaf], forkId: 0 });
  const {
    indices: [index],
  } = await service.findLeafIndices({ treeId: NOTE_HASH_TREE, revision: uncommitted, leaves: [leaf], startIndex: 0 });
  assert.equal(typeof index, 'number');
  const { value } = await service.getLeafValue({ treeId: NOTE_HASH_TREE, revision: uncommitted, leafIndex: index });
  assert.deepEqual(Buffer.from(value), Buffer.from(leaf));
  const { path } = await service.getSiblingPath({ treeId: NOTE_HASH_TREE, revision: uncommitted, leafIndex: index });
  assert.equal(path.length, 42);
  // Committed reads still see the genesis.
  const { indices } = await service.findLeafIndices({
    treeId: NOTE_HASH_TREE,
    revision: committed,
    leaves: [leaf],
    startIndex: 0,
  });
  assert.deepEqual(indices, [null]);
});

test('nullifier inserts return witnesses, and duplicates are the service saying no', async () => {
  const nullifier = randomFr();
  const { result } = await service.sequentialInsertNullifier({ leaves: [{ nullifier }], forkId: 0 });
  assert.equal(result.lowLeafWitnessData.length, 1);
  assert.equal(result.insertionWitnessData.length, 1);
  const low = await service.findLowLeaf({ treeId: NULLIFIER_TREE, revision: uncommitted, key: nullifier });
  assert.equal(low.alreadyPresent, true);

  await assert.rejects(service.sequentialInsertNullifier({ leaves: [{ nullifier }], forkId: 0 }), error => {
    assert.ok(error instanceof WsdbError);
    assert.match(error.message, /already exists/);
    return true;
  });
});

test('requests outside the reference are errors, not crashes', async () => {
  await assert.rejects(
    service.getTreeInfo({ treeId: NOTE_HASH_TREE, revision: { ...uncommitted, forkId: 1 } }),
    /the reference world state has one fork \(0\), not 1/,
  );
  await assert.rejects(
    service.getTreeInfo({ treeId: NOTE_HASH_TREE, revision: { ...uncommitted, blockNumber: 7 } }),
    /keeps no block history/,
  );
  // The service still answers afterwards (a wasm module that aborted would not).
  const info = await service.getTreeInfo({ treeId: ARCHIVE, revision: committed });
  assert.equal(info.size, 1);
});

test('the synchronous service reaches the same world state', async () => {
  const sync = await WsdbServiceSync.create({ backend });
  try {
    const archive = sync.getTreeInfo({ treeId: ARCHIVE, revision: committed });
    assert.equal(toBigInt(archive.root), protocolConstant('GENESIS_ARCHIVE_ROOT'));
  } finally {
    sync.destroy();
  }
});
