import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readSymbolSelection, selectSymbols } from './selection.ts';

const content = {
  constants: {
    TREE_HEIGHT: '10',
    NOTE_TREE_HEIGHT: '20',
    MAX_NOTES_PER_TX: '30',
    ARCHIVE_HEIGHT: '40',
    GENESIS_BLOCK_HASH: '50',
  },
  domainSeparatorEnum: {
    MERKLE_HASH: 1,
    NOTE_HASH: 2,
    OUTER_HASH: 3,
  },
};

function readSelection(selection: unknown) {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-selection-'));
  const path = join(tempDir, 'selection.json');
  try {
    writeFileSync(path, JSON.stringify(selection));
    return readSymbolSelection(path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('a selection names constants and domain separators by source symbol name', () => {
  const selection = readSelection(['ARCHIVE_HEIGHT', 'DOM_SEP__MERKLE_HASH']);
  const selected = selectSymbols(content, selection);

  assert.deepEqual(Object.keys(selected.constants), ['ARCHIVE_HEIGHT']);
  assert.deepEqual(Object.keys(selected.domainSeparatorEnum), ['MERKLE_HASH']);
});

test('a regex entry selects every matching symbol in source order', () => {
  const selection = readSelection(['.*_HEIGHT']);

  assert.deepEqual(Object.keys(selectSymbols(content, selection).constants), [
    'TREE_HEIGHT',
    'NOTE_TREE_HEIGHT',
    'ARCHIVE_HEIGHT',
  ]);
});

test('regex entries must match the whole symbol name', () => {
  const selection = readSelection(['TREE.*']);

  assert.deepEqual(Object.keys(selectSymbols(content, selection).constants), ['TREE_HEIGHT']);
});

test('a regex entry can select constants and domain separators together', () => {
  const selection = readSelection(['.*_HASH']);
  const selected = selectSymbols(content, selection);

  assert.deepEqual(Object.keys(selected.constants), ['GENESIS_BLOCK_HASH']);
  assert.deepEqual(Object.keys(selected.domainSeparatorEnum), ['MERKLE_HASH', 'NOTE_HASH', 'OUTER_HASH']);
});

test('exact names and regex entries combine without duplicates', () => {
  const selection = readSelection(['TREE_HEIGHT', '.*_HEIGHT', 'DOM_SEP__.*']);
  const selected = selectSymbols(content, selection);

  assert.deepEqual(Object.keys(selected.constants), ['TREE_HEIGHT', 'NOTE_TREE_HEIGHT', 'ARCHIVE_HEIGHT']);
  assert.deepEqual(Object.keys(selected.domainSeparatorEnum), ['MERKLE_HASH', 'NOTE_HASH', 'OUTER_HASH']);
});

test('a regex entry matching no symbols is an error', () => {
  const selection = readSelection(['MISSING_.*']);

  assert.throws(() => selectSymbols(content, selection), /pattern 'MISSING_\.\*' in selection matched no symbols/);
});

test('an exact name entry must name an existing symbol', () => {
  const selection = readSelection(['UNKNOWN_CONSTANT']);

  assert.throws(() => selectSymbols(content, selection), /unknown symbol 'UNKNOWN_CONSTANT' in selection/);
});

test('an invalid regex entry is rejected when reading the selection', () => {
  assert.throws(() => readSelection(['MAX_[']), /invalid pattern 'MAX_\['/);
});

test('duplicate entries are rejected when reading the selection', () => {
  assert.throws(() => readSelection(['ARCHIVE_HEIGHT', 'ARCHIVE_HEIGHT']), /duplicate entry 'ARCHIVE_HEIGHT'/);
});

test('a selection that is not an array of strings is rejected', () => {
  assert.throws(
    () => readSelection({ constants: ['ARCHIVE_HEIGHT'], domainSeparators: [] }),
    /must be a JSON array of strings/,
  );
});
