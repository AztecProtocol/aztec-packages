import { Pedersen } from './pedersen.js';
import { Timer } from '../benchmark/timer.js';
import { Fr } from '../types/index.js';

describe('pedersen sync', () => {
  it('pedersenHash', async () => {
    const pedersen = await Pedersen.new();
    const result = pedersen.pedersenHash([new Fr(4n).toBuffer(), new Fr(8n).toBuffer()], 7);
    expect(result).toMatchSnapshot();
  });

  it('pedersenHashBuffer', async () => {
    const input = Buffer.alloc(123);
    input.writeUint32BE(321, 0);
    input.writeUint32BE(456, 119);
    const pedersen = await Pedersen.new();
    const r = pedersen.pedersenHashBuffer(input);
    expect(r).toMatchSnapshot();
  });

  it('pedersenCommit', async () => {
    const pedersen = await Pedersen.new();
    const result = pedersen.pedersenCommit([new Fr(4n).toBuffer(), new Fr(8n).toBuffer(), new Fr(12n).toBuffer()]);
    expect(result).toMatchSnapshot();
  });

  it.skip('pedersenCommit perf test', async () => {
    const pedersen = await Pedersen.new();
    const loops = 1000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random());
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      pedersen.pedersenCommit([fields[i * 2].toBuffer(), fields[i * 2 + 1].toBuffer()]);
    }
    console.log(t.us() / loops);
  });
});
