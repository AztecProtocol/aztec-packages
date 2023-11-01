import { pedersenCommit } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { Timer } from '@aztec/foundation/timer';

describe('pedersen', () => {
  const loops = 1000;
  const fields = Array.from({ length: loops * 2 }).map(() => Fr.random().toBuffer());

  it('pedersen perf', () => {
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      pedersenCommit([fields[i * 2], fields[i * 2 + 1]]);
    }
    console.log(t.us() / loops);
    // console.log(pedersenCommitWasm(wasm, [toBufferBE(1n, 32), toBufferBE(1n, 32)]));
  });

  // it('pedersen perf elliptic', () => {
  //   const t = new Timer();
  //   for (let i = 0; i < loops; ++i) {
  //     pedersenCommit([fields[i * 2], fields[i * 2 + 1]]);
  //   }
  //   console.log(t.us() / loops);
  //   // console.log(pedersenCommit([toBufferBE(1n, 32), toBufferBE(1n, 32)]));
  // });

  // it('pedersen perf noble', () => {
  //   const loops = 10000;
  //   const t = new Timer();
  //   for (let i = 0; i < loops; ++i) {
  //     pedersenCommitNoble([toBufferBE(1n, 32), toBufferBE(1n, 32)]);
  //   }
  //   console.log(t.us() / loops);
  // });
});
