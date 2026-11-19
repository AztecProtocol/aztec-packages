// bb.js's react-native build under Hermes: Barretenberg and BarretenbergSync on bb's native library, through
// ipc-runtime's JSI binding (the CRS is skipped: the test host has no HTTPS).
import '../js/index.js';

import { Barretenberg, BarretenbergSync } from '@aztec-foundation/bb.js';

import { equal, run, test } from './harness.js';

const fr = n => {
  const bytes = new Uint8Array(32);
  bytes[31] = n;
  return bytes;
};

test('Barretenberg and BarretenbergSync agree on poseidon2', async () => {
  const sync = await BarretenbergSync.new();
  const api = await Barretenberg.new({ skipSrsInit: true });
  const expected = sync.poseidon2Hash({ inputs: [fr(1), fr(2)] }).hash;
  const results = await Promise.all([1, 2, 3].map(n => api.poseidon2Hash({ inputs: [fr(n), fr(2)] })));
  equal(results[0].hash, expected, 'async = sync');
  equal(
    Array.from(expected, b => b.toString(16).padStart(2, '0')).join(''),
    '038682aa1cb5ae4e0a3f13da432a95c77c5c111f6f030faf9cad641ce1ed7383',
    'poseidon2(1, 2)',
  );
  await api.destroy();
  sync.destroy();
});

run();
