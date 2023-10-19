import { Barretenberg } from '../barretenberg/index.js';
import { Fr } from '../types/index.js';

describe('pedersen', () => {
  let api: Barretenberg;

  beforeAll(async () => {
    api = await Barretenberg.new(1);
    await api.pedersenHashInit();
  }, 30000);

  afterAll(async () => {
    await api.destroy();
  });

  it('pedersenCompressFields', async () => {
    const result = await api.pedersenCompressFields(new Fr(4n), new Fr(8n));
    expect(result).toEqual(new Fr(13982758649432613336147872733411006657097928907798377266063228888290725444169n));
  });

  it('pedersenPlookupCompressFields', async () => {
    const result = await api.pedersenPlookupCompressFields(new Fr(4n), new Fr(8n));
    expect(result).toEqual(new Fr(13982758649432613336147872733411006657097928907798377266063228888290725444169n));
  });

  it('pedersenCompress', async () => {
    const result = await api.pedersenCompress([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(new Fr(19056579601153937652779328314485097390897358462541238912904230749502508633726n));
  });

  it('pedersenPlookupCompress', async () => {
    const result = await api.pedersenPlookupCompress([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(new Fr(19056579601153937652779328314485097390897358462541238912904230749502508633726n));
  });

  it('pedersenCompressWithHashIndex', async () => {
    const result = await api.pedersenCompressWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    expect(result).toEqual(new Fr(9623070643626513033232363421644611403228818065703560824918278791880825345070n));
  });

  it('pedersenCommit', async () => {
    const result = await api.pedersenCommit([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(new Fr(18374309251862457296563484909553154519357910650678202211610516068880120638872n));
  });

  it('pedersenPlookupCommit', async () => {
    const result = await api.pedersenPlookupCommit([new Fr(4n), new Fr(8n)]);
    expect(result).toEqual(new Fr(7336965135159957330095956915667769834743631571088528744280187985812103412470n));
  });

  it('pedersenBufferToField', async () => {
    const result = await api.pedersenBufferToField(
      Buffer.from('Hello world! I am a buffer to be converted to a field!'),
    );
    expect(result).toEqual(new Fr(8552025510016673626971243114002298733165590265505387301921017959053622217825n));
  });

  it('pedersenHashPair', async () => {
    const result = await api.pedersenHashPair(new Fr(4n), new Fr(8n));
    expect(result).toEqual(new Fr(13982758649432613336147872733411006657097928907798377266063228888290725444169n));
  });

  it('pedersenHashMultiple', async () => {
    const result = await api.pedersenHashMultiple([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(new Fr(19056579601153937652779328314485097390897358462541238912904230749502508633726n));
  });

  it('pedersenHashMultipleWithHashIndex', async () => {
    const result = await api.pedersenHashMultipleWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    expect(result).toEqual(new Fr(9623070643626513033232363421644611403228818065703560824918278791880825345070n));
  });

  it('pedersenHashToTree', async () => {
    const result = await api.pedersenHashToTree([new Fr(4n), new Fr(8n), new Fr(12n), new Fr(16n)]);
    expect(result).toEqual([
      new Fr(4n),
      new Fr(8n),
      new Fr(12n),
      new Fr(16n),
      new Fr(13982758649432613336147872733411006657097928907798377266063228888290725444169n),
      new Fr(1319116096575922946541582119791221180923112201751318788162745363104756571250n),
      new Fr(11663284539342402700106107283927625502644585486344246278789732908619286294294n),
    ]);
  });
});
