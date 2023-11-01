import { Pedersen } from './pedersen.js';
import { Timer } from '../benchmark/timer.js';
import { Fr, Point } from '../types/index.js';

describe('pedersen sync', () => {
  it('pedersenHashWithHashIndex', async () => {
    const pedersen = await Pedersen.new();
    const result = pedersen.pedersenHashWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    expect(result).toEqual(new Fr(2152386650411553803409271316104075950536496387580531018130718456431861859990n));
  });

  it('pedersenCommit', async () => {
    const pedersen = await Pedersen.new();
    const result = pedersen.pedersenCommit([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(
      new Point(
        new Fr(18374309251862457296563484909553154519357910650678202211610516068880120638872n),
        new Fr(2572141322478528249692953821523229170092797347760799983831061874108357705739n),
      ),
    );
  });

  it.skip('pedersenCommit perf test', async () => {
    const pedersen = await Pedersen.new();
    const loops = 1000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random());
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      pedersen.pedersenCommit([fields[i * 2], fields[i * 2 + 1]]);
    }
    console.log(t.us() / loops);
  });
});
