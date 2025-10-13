import { Barretenberg } from './index.js';
import { Timer } from '../benchmark/timer.js';
import { Fr } from '../types/index.js';

describe.each([
  ['native', { forceNative: true }],
  ['wasm', { forceWasm: true, threads: 1 }],
])('poseidon async - %s backend', (backendName, options) => {
  let api: Barretenberg;

  beforeAll(async () => {
    api = await Barretenberg.initSingleton(options);
  });

  afterAll(async () => {
    await Barretenberg.destroySingleton();
  });

  it('poseidonHash', async () => {
    const response = await api.poseidon2Hash({ inputs: [new Fr(4n).toBuffer(), new Fr(8n).toBuffer()] });
    const result = Fr.fromBuffer(response.hash);
    expect(result).toMatchSnapshot();
  });

  it('poseidonHash perf test', async () => {
    const loops = 3000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random().toBuffer());
    const start = performance.now();
    for (let i = 0; i < loops; ++i) {
      await api.poseidon2Hash({
        inputs: [
          fields[i * 2],
          fields[i * 2 + 1],
          fields[i * 2],
          fields[i * 2 + 1],
          fields[i * 2],
          fields[i * 2 + 1],
          fields[i * 2],
          fields[i * 2 + 1],
          fields[i * 2],
          fields[i * 2 + 1],
          fields[i * 2],
          fields[i * 2 + 1],
          fields[i * 2],
          fields[i * 2 + 1],
          fields[i * 2],
          fields[i * 2 + 1],
        ],
      });
    }
    const time = performance.now() - start;
    const us = (time / loops) * 1000;
    console.log(`[${backendName}] Executed ${loops} hashes at an average ${us.toFixed(0)}us / hash`);
  });

  // TODO: poseidon2Hashes not yet in new msgpack API
  // it.skip('poseidonHashes perf test', () => {
  //   const loops = 10;
  //   const numHashesPerLoop = 1024;
  //   const fields = Array.from({ length: loops * 2 }).map(() => Fr.random());
  //   const t = new Timer();
  //   for (let i = 0; i < loops; ++i) {
  //     // api.poseidon2Hashes(fields); // Not in new API yet
  //   }
  //   const us = t.us() / (numHashesPerLoop * loops);
  //   console.log(`Executed ${numHashesPerLoop * loops} hashes at an average ${us}us / hash`);
  // });
});
