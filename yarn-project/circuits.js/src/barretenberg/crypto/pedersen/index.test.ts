import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { pedersenCommit, pedersenCommitNoble } from '@aztec/foundation/crypto';
import { Timer } from '@aztec/foundation/timer';

import { CircuitsWasm } from '../../../wasm/index.js';
import { pedersenCommitWasm } from './index.js';

describe('pedersen', () => {
  beforeAll(async () => {});

  it('pedersen perf wasm', async () => {
    const wasm = await CircuitsWasm.get();
    const loops = 10000;
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      pedersenCommitWasm(wasm, [toBufferBE(1n, 32), toBufferBE(1n, 32)]);
    }
    console.log(t.us() / loops);
    console.log(pedersenCommitWasm(wasm, [toBufferBE(1n, 32), toBufferBE(1n, 32)]));
  });

  it('pedersen perf elliptic', () => {
    const loops = 10000;
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      pedersenCommit([toBufferBE(1n, 32), toBufferBE(1n, 32)]);
    }
    console.log(t.us() / loops);
    console.log(pedersenCommit([toBufferBE(1n, 32), toBufferBE(1n, 32)]));
  });

  // it('pedersen perf noble', () => {
  //   const loops = 10000;
  //   const t = new Timer();
  //   for (let i = 0; i < loops; ++i) {
  //     pedersenCommitNoble([toBufferBE(1n, 32), toBufferBE(1n, 32)]);
  //   }
  //   console.log(t.us() / loops);
  // });
});
