import { bn254 } from '@noble/curves/bn254';
import { writeFile } from 'fs/promises';

// To update the test data, run "export AZTEC_GENERATE_TEST_DATA=1" in shell and run the tests again
const AZTEC_GENERATE_TEST_DATA = !!process.env.AZTEC_GENERATE_TEST_DATA;

describe('BN254 Registration', () => {
  it('should generate the same constants as the solidity code', async () => {
    expect(bn254.fields.Fp.ORDER).toBe(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
    expect(bn254.fields.Fr.ORDER).toBe(21888242871839275222246405745257275088548364400416034343698204186575808495617n);

    const g1Base = bn254.G1.ProjectivePoint.BASE.toAffine();
    expect(g1Base.x).toBe(1n);
    expect(g1Base.y).toBe(2n);

    const negativeG1 = bn254.G1.ProjectivePoint.ZERO.subtract(bn254.G1.ProjectivePoint.BASE).toAffine();
    expect(negativeG1.x).toBe(1n);
    expect(negativeG1.y).toBe(21888242871839275222246405745257275088696311157297823662689037894645226208581n);

    const g2Base = bn254.G2.ProjectivePoint.BASE.toAffine();
    expect(g2Base.x.c0).toBe(10857046999023057135944570762232829481370756359578518086990519993285655852781n);
    expect(g2Base.x.c1).toBe(11559732032986387107991004021392285783925812861821192530917403151452391805634n);
    expect(g2Base.y.c0).toBe(8495653923123431417604973247489272438418190587263600148770280649306958101930n);
    expect(g2Base.y.c1).toBe(4082367875863433681332203403145435568316851327593401208105741076214120093531n);

    const negativeG2 = bn254.G2.ProjectivePoint.ZERO.subtract(bn254.G2.ProjectivePoint.BASE).toAffine();
    expect(negativeG2.x.c0).toBe(10857046999023057135944570762232829481370756359578518086990519993285655852781n);
    expect(negativeG2.x.c1).toBe(11559732032986387107991004021392285783925812861821192530917403151452391805634n);
    expect(negativeG2.y.c0).toBe(13392588948715843804641432497768002650278120570034223513918757245338268106653n);
    expect(negativeG2.y.c1).toBe(17805874995975841540914202342111839520379459829704422454583296818431106115052n);

    if (AZTEC_GENERATE_TEST_DATA) {
      const startingScalar = 0x7777777n;
      const keysToGenerate = 50;

      const keys = [];
      for (let i = 0; i < keysToGenerate; i++) {
        const sk = startingScalar + BigInt(i);
        const pk1Weierstrass = bn254.G1.ProjectivePoint.BASE.multiply(sk);
        const negativePk1Weierstrass = bn254.G1.ProjectivePoint.ZERO.subtract(pk1Weierstrass);
        const pk2Weierstrass = bn254.G2.ProjectivePoint.BASE.multiply(sk);
        const negativePk2Weierstrass = bn254.G2.ProjectivePoint.ZERO.subtract(pk2Weierstrass);

        const pk1 = pk1Weierstrass.toAffine();
        const negativePk1 = negativePk1Weierstrass.toAffine();
        const pk2 = pk2Weierstrass.toAffine();
        const negativePk2 = negativePk2Weierstrass.toAffine();

        keys.push({
          sk: sk,
          pk1: { x: pk1.x, y: pk1.y },
          negativePk1: { x: negativePk1.x, y: negativePk1.y },
          pk2: { x0: pk2.x.c0, x1: pk2.x.c1, y0: pk2.y.c0, y1: pk2.y.c1 },
          negativePk2: {
            x0: negativePk2.x.c0,
            x1: negativePk2.x.c1,
            y0: negativePk2.y.c0,
            y1: negativePk2.y.c1,
          },
        });
      }

      const jsonString = JSON.stringify(
        {
          fpOrder: bn254.fields.Fp.ORDER,
          frOrder: bn254.fields.Fr.ORDER,
          g1Generator: {
            x: g1Base.x,
            y: g1Base.y,
          },
          g2Generator: {
            x0: g2Base.x.c0,
            x1: g2Base.x.c1,
            y0: g2Base.y.c0,
            y1: g2Base.y.c1,
          },
          negativeG1Generator: {
            x: negativeG1.x,
            y: negativeG1.y,
          },
          negativeG2Generator: {
            x0: negativeG2.x.c0,
            x1: negativeG2.x.c1,
            y0: negativeG2.y.c0,
            y1: negativeG2.y.c1,
          },
          sampleKeys: keys,
        },
        // We need the bigints to be written as literal big integers (no quotes)
        // By default, JSON.stringify will write them as strings.
        (key, value) => (typeof value === 'bigint' ? `__BIGINT__${value.toString()}__BIGINT__` : value),
        2,
      );

      const unquotedJson = jsonString.replace(/"__BIGINT__(\d+)__BIGINT__"/g, '$1');

      const path = `../../l1-contracts/test/fixtures/bn254_constants.json`;
      await writeFile(path, unquotedJson, 'utf8');
    }
  });
});
