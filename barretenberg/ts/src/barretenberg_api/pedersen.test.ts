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
    expect(result).toEqual(new Fr(1521373897829389584529155077412196627698249315427143054350987371861781120260n));
  });

  it('pedersenCompress', async () => {
    const result = await api.pedersenCompress([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(new Fr(16354408412011670665169322571938780771784319449166930406648760506154417354381n));
  });

  it('pedersenCompressWithHashIndex', async () => {
    const result = await api.pedersenCompressWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    expect(result).toEqual(new Fr(2152386650411553803409271316104075950536496387580531018130718456431861859990n));
  });

  it('pedersenCompressAndHashSame', async () => {
    const resultCompress = await api.pedersenCompressWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    const resultHash = await api.pedersenHashWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    expect(resultCompress).toEqual(resultHash);
  });

  it('pedersenHashWith0IndexSameAsNoIndex', async () => {
    const resultHashImplicit0 = await api.pedersenHash([new Fr(4n), new Fr(8n)]);
    const resultCompressImplicit0 = await api.pedersenCompress([new Fr(4n), new Fr(8n)]);
    const resultCompressFieldsImplicit0 = await api.pedersenCompressFields(new Fr(4n), new Fr(8n));
    const resultHashExplicit0 = await api.pedersenHashWithHashIndex([new Fr(4n), new Fr(8n)], 0);
    expect(resultHashImplicit0).toEqual(resultCompressImplicit0);
    expect(resultHashImplicit0).toEqual(resultHashExplicit0);
    expect(resultHashImplicit0).toEqual(resultCompressFieldsImplicit0);
  });

  it('pedersenHashPairSameAsWith0Index', async () => {
    const resultHashPair = await api.pedersenHashPair(new Fr(4n), new Fr(8n));
    const resultHashExplicit0 = await api.pedersenHashWithHashIndex([new Fr(4n), new Fr(8n)], 0);
    expect(resultHashExplicit0).toEqual(resultHashPair);
  });

  it('pedersenHashMultipleSameAsWith0Index', async () => {
    const resultHashPair = await api.pedersenHashMultiple([new Fr(4n), new Fr(8n)]);
    const resultHashExplicit0 = await api.pedersenHashWithHashIndex([new Fr(4n), new Fr(8n)], 0);
    expect(resultHashExplicit0).toEqual(resultHashPair);
  });

  it('pedersenCommit', async () => {
    const result = await api.pedersenCommit([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(new Fr(18374309251862457296563484909553154519357910650678202211610516068880120638872n));
  });

  it('pedersenHashPair', async () => {
    const result = await api.pedersenHashPair(new Fr(4n), new Fr(8n));
    expect(result).toEqual(new Fr(1521373897829389584529155077412196627698249315427143054350987371861781120260n));
  });

  it('pedersenHashMultiple', async () => {
    const result = await api.pedersenHashMultiple([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(new Fr(16354408412011670665169322571938780771784319449166930406648760506154417354381n));
  });

  it('pedersenHashMultipleWithHashIndex', async () => {
    const result = await api.pedersenHashMultipleWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    expect(result).toEqual(new Fr(2152386650411553803409271316104075950536496387580531018130718456431861859990n));
  });

  it('pedersenHashToTree', async () => {
    const result = await api.pedersenHashToTree([new Fr(4n), new Fr(8n), new Fr(12n), new Fr(16n)]);
    expect(result).toEqual([
      new Fr(4n),
      new Fr(8n),
      new Fr(12n),
      new Fr(16n),
      new Fr(1521373897829389584529155077412196627698249315427143054350987371861781120260n),
      new Fr(18350527319045519333962768191016242826584323959670139897255818770108115223653n),
      new Fr(5972535902427608430534212385621973704186819235181735133037695406667218179357n),
    ]);
  });
});
