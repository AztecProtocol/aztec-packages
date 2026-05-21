#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../wasm-bench.config.json', import.meta.url), 'utf8'));
const targets = config.targets ?? {};
const targetNames = new Set(Object.keys(targets));

function assertTargetsExist(name, list) {
  assert.ok(Array.isArray(list), `${name} must be an array`);
  assert.ok(list.length > 0, `${name} must not be empty`);
  for (const target of list) {
    assert.ok(targetNames.has(target), `${name} references unknown target ${target}`);
  }
}

assertTargetsExist('defaultMatrix', config.defaultMatrix);
assertTargetsExist('extendedMatrix', config.extendedMatrix);
for (const [name, profile] of Object.entries(config.matrixProfiles ?? {})) {
  assertTargetsExist(`matrixProfiles.${name}.targets`, profile.targets);
}

assert.deepEqual(config.matrixProfiles?.default?.targets, config.defaultMatrix);
assert.deepEqual(config.matrixProfiles?.all?.targets, config.extendedMatrix);
assert.ok(config.matrixProfiles?.['customer-balanced'], 'customer-balanced matrix profile must exist');
assert.ok(
  config.matrixProfiles['customer-balanced'].targets.every((target) => targets[target].driver === 'automate'),
  'customer-balanced should stay on BrowserStack Automate targets',
);
