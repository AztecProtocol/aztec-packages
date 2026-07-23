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
  },
  domainSeparatorEnum: {
    MERKLE_HASH: 1,
    NOTE_HASH: 2,
    OUTER_HASH: 3,
  },
};

function readSelection(selection: object) {
  const tempDir = mkdtempSync(join(tmpdir(), 'constants-selection-'));
  const path = join(tempDir, 'selection.json');
  try {
    writeFileSync(path, JSON.stringify(selection));
    return readSymbolSelection(path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('a regex entry selects every matching symbol in source order', () => {
  const selection = readSelection({ constants: ['.*_HEIGHT'], domainSeparators: [] });

  assert.deepEqual(Object.keys(selectSymbols(content, selection).constants), [
    'TREE_HEIGHT',
    'NOTE_TREE_HEIGHT',
    'ARCHIVE_HEIGHT',
  ]);
});

test('regex entries must match the whole symbol name', () => {
  const selection = readSelection({ constants: ['TREE.*'], domainSeparators: [] });

  assert.deepEqual(Object.keys(selectSymbols(content, selection).constants), ['TREE_HEIGHT']);
});

test('exact names and regex entries combine without duplicates', () => {
  const selection = readSelection({ constants: ['TREE_HEIGHT', '.*_HEIGHT'], domainSeparators: ['.*_HASH'] });
  const selected = selectSymbols(content, selection);

  assert.deepEqual(Object.keys(selected.constants), ['TREE_HEIGHT', 'NOTE_TREE_HEIGHT', 'ARCHIVE_HEIGHT']);
  assert.deepEqual(Object.keys(selected.domainSeparatorEnum), ['MERKLE_HASH', 'NOTE_HASH', 'OUTER_HASH']);
});

test('a regex entry matching no symbols is an error', () => {
  const selection = readSelection({ constants: ['MISSING_.*'], domainSeparators: [] });

  assert.throws(() => selectSymbols(content, selection), /pattern 'MISSING_\.\*' in selection matched no constants/);
});

test('an exact name entry still requires the symbol to exist', () => {
  const selection = readSelection({ constants: ['UNKNOWN_CONSTANT'], domainSeparators: [] });

  assert.throws(() => selectSymbols(content, selection), /unknown constant 'UNKNOWN_CONSTANT' in selection/);
});

test('an invalid regex entry is rejected when reading the selection', () => {
  assert.throws(
    () => readSelection({ constants: ['MAX_['], domainSeparators: [] }),
    /invalid constants pattern 'MAX_\['/,
  );
});
