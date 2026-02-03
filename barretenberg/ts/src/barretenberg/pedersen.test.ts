import { BarretenbergSync } from './index.js';
import { Timer } from '../benchmark/timer.js';
import { Fr } from './testing/fields.js';

describe('pedersen sync', () => {
  let api: BarretenbergSync;

  beforeAll(async () => {
    api = await BarretenbergSync.initSingleton();
  });

  it('pedersenHash', () => {
    const response = api.pedersenHash({ inputs: [new Fr(4n).toBuffer(), new Fr(8n).toBuffer()], hashIndex: 7 });
    const result = Fr.fromBuffer(response.hash);
    expect(result).toMatchSnapshot();
  });

  it('pedersenHash perf test', () => {
    const loops = 1000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random());
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      api.pedersenHash({ inputs: [fields[i * 2].toBuffer(), fields[i * 2 + 1].toBuffer()], hashIndex: 0 });
    }
    const us = t.us() / loops;
    console.log(`Executed ${loops} hashes at an average ${us}us / hash`);
  });

  // TODO: pedersenHashes not yet in new msgpack API
  // it.skip('pedersenHashes perf test', () => {
  //   const loops = 10;
  //   const numHashesPerLoop = 1024;
  //   const fields = Array.from({ length: numHashesPerLoop * 2 }).map(() => Fr.random());
  //   const t = new Timer();
  //   for (let i = 0; i < loops; ++i) {
  //     // api.pedersenHashes(fields, 0); // Not in new API yet
  //   }
  //   const us = t.us() / (numHashesPerLoop * loops);
  //   console.log(`Executed ${numHashesPerLoop * loops} hashes at an average ${us}us / hash`);
  // });

  it('pedersenHashBuffer', () => {
    const input = Buffer.alloc(123);
    input.writeUint32BE(321, 0);
    input.writeUint32BE(456, 119);
    const response = api.pedersenHashBuffer({ input, hashIndex: 0 });
    const r = Fr.fromBuffer(response.hash);
    expect(r).toMatchSnapshot();
  });

  it('pedersenCommit', () => {
    const response = api.pedersenCommit({
      inputs: [new Fr(4n).toBuffer(), new Fr(8n).toBuffer(), new Fr(12n).toBuffer()],
      hashIndex: 0,
    });
    const result = { x: Fr.fromBuffer(response.point.x), y: Fr.fromBuffer(response.point.y) };
    expect(result).toMatchSnapshot();
  });

  it.skip('pedersenCommit perf test', () => {
    const loops = 1000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random());
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      api.pedersenCommit({ inputs: [fields[i * 2].toBuffer(), fields[i * 2 + 1].toBuffer()], hashIndex: 0 });
    }
    console.log(t.us() / loops);
  });
});
