// Tests of the generated @aztec-foundation/wsdb-ref package against one backend, from its build.
// Run through wsdb_ref_test.sh, which sets WSDB_REF_TEST_BACKEND to process-uds, process-shm (a spawned
// wsdb-ref binary over a socket or shared memory), napi or wasm.
//
// Every napi backend in a process shares one world state (node loads the addon once), so the
// tests read the genesis through committed reads, which writes never change, and write only fresh
// random keys. Each service is sent Init first, with the test's own genesis.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { WsdbError, WsdbService, WsdbServiceSync } from '@aztec-foundation/wsdb-ref';

const BACKENDS = {
  'process-uds': { backend: 'process', process: { transport: 'uds' } },
  'process-shm': { backend: 'process', process: { transport: 'shm' } },
  napi: { backend: 'napi' },
  wasm: { backend: 'wasm' },
};
const options = BACKENDS[process.env.WSDB_REF_TEST_BACKEND];
assert.ok(options, `WSDB_REF_TEST_BACKEND must be one of ${Object.keys(BACKENDS).join(', ')}`);

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const constantsNr = readFileSync(
  join(root, 'noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr'),
  'utf8',
);
function protocolU32(name) {
  const match = constantsNr.match(new RegExp(`pub global ${name}: u32 = (\\d+);`));
  assert.ok(match, `${name} not found in constants.nr`);
  return Number(match[1]);
}

// The test's own genesis: protocol-sized trees with no prefilled leaves. The canonical genesis, with the protocol
// contracts' nullifiers and the roots constants.nr records, is checked by wsdb-ref's C++ tests.
const GENESIS = {
  treeHeights: [
    { treeId: 0, height: 42 },
    { treeId: 1, height: 42 },
    { treeId: 2, height: 40 },
    { treeId: 3, height: 36 },
    { treeId: 4, height: 30 },
  ],
  treePrefill: [
    { treeId: 0, size: 128 },
    { treeId: 2, size: 128 },
  ],
  prefilledPublicData: [],
  prefilledNullifiers: [],
  genesisTimestamp: 0,
  initialHeaderGeneratorPoint: protocolU32('DOM_SEP__BLOCK_HEADER_HASH'),
};

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
let genesisArchiveRoot;
before(async () => {
  service = await WsdbService.create(options);
  await service.init(GENESIS);
});
after(async () => {
  await service.destroy();
});

test('serves the genesis Init gave it', async () => {
  const nullifiers = await service.getTreeInfo({ treeId: NULLIFIER_TREE, revision: committed });
  assert.equal(nullifiers.size, 128);
  assert.equal(nullifiers.depth, 42);

  const archive = await service.getTreeInfo({ treeId: ARCHIVE, revision: committed });
  assert.equal(archive.size, 1);
  assert.equal(archive.depth, 30);
  genesisArchiveRoot = toBigInt(archive.root);

  const header = await service.getLeafValue({ treeId: ARCHIVE, revision: committed, leafIndex: 0 });
  assert.ok(header.value, 'the genesis block header is in the archive');

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
    assert.match(error.message, /is already present/);
    return true;
  });
});

test('forks are separate world states, and bad requests are errors, not crashes', async () => {
  const { forkId } = await service.createFork({ latest: true, blockNumber: 0 });
  await service.appendLeaves({ treeId: NOTE_HASH_TREE, leaves: [randomFr()], forkId });
  const onFork = await service.getTreeInfo({ treeId: NOTE_HASH_TREE, revision: { ...uncommitted, forkId } });
  const canonical = await service.getTreeInfo({ treeId: NOTE_HASH_TREE, revision: committed });
  assert.equal(onFork.size, canonical.size + 1);
  await service.deleteFork({ forkId });

  await assert.rejects(
    service.getTreeInfo({ treeId: NOTE_HASH_TREE, revision: { ...uncommitted, forkId } }),
    /Fork not found/,
  );
  await assert.rejects(
    service.getTreeInfo({ treeId: NOTE_HASH_TREE, revision: { ...uncommitted, blockNumber: 7 } }),
    /latest block is 0/,
  );
  // The service still answers afterwards (a wasm module that aborted would not).
  const info = await service.getTreeInfo({ treeId: ARCHIVE, revision: committed });
  assert.equal(info.size, 1);
});

test('the synchronous service, given the same Init, reaches the same genesis', async () => {
  // A synchronous process client is always over shared memory.
  const sync = await WsdbServiceSync.create({ backend: options.backend });
  try {
    sync.init(GENESIS);
    const archive = sync.getTreeInfo({ treeId: ARCHIVE, revision: committed });
    assert.equal(toBigInt(archive.root), genesisArchiveRoot);
  } finally {
    sync.destroy();
  }
});
