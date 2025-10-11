import { BarretenbergSync } from './index.js';
import { Timer } from '../benchmark/timer.js';
import { Fr } from '../types/index.js';

describe('poseidon sync', () => {
  let api: BarretenbergSync;

  beforeAll(async () => {
    api = await BarretenbergSync.initSingleton();
  });

  it('poseidonHash', () => {
    const response = api.poseidon2Hash({ inputs: [new Fr(4n).toBuffer(), new Fr(8n).toBuffer()] });
    const result = Fr.fromBuffer(response.hash);
    expect(result).toMatchSnapshot();
  });

  it('poseidonHash perf test', () => {
    const loops = 1000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random().toBuffer());
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      api.poseidon2Hash({ inputs: [fields[i * 2], fields[i * 2 + 1]] });
    }
    const us = t.us() / loops;
    console.log(`Executed ${loops} hashes at an average ${us}us / hash`);
  });

  // TODO: poseidon2Hashes not yet in new msgpack API
  // it.skip('poseidonHashes perf test', () => {
  //   const loops = 10;
  //   const numHashesPerLoop = 1024;
  //   const fields = Array.from({ length: numHashesPerLoop * 2 }).map(() => Fr.random());
  //   const t = new Timer();
  //   for (let i = 0; i < loops; ++i) {
  //     // api.poseidon2Hashes(fields); // Not in new API yet
  //   }
  //   const us = t.us() / (numHashesPerLoop * loops);
  //   console.log(`Executed ${numHashesPerLoop * loops} hashes at an average ${us}us / hash`);
  // });
});
