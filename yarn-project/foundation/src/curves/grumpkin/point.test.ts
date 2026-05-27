import { jsonParseWithSchema, jsonStringify } from '../../json-rpc/convert.js';
import { Fr } from '../bn254/field.js';
import { Point } from './point.js';

describe('Point', () => {
  describe('random', () => {
    it('always returns a valid point', async () => {
      for (let i = 0; i < 100; ++i) {
        const point = await Point.random();
        expect(point.isOnCurve()).toEqual(true);
      }
    });

    it('returns a different points on each call', async () => {
      const set = new Set();
      for (let i = 0; i < 100; ++i) {
        set.add(await Point.random());
      }

      expect(set.size).toEqual(100);
    });
  });

  it('converts to and from x and sign of y coordinate', async () => {
    const p = new Point(
      new Fr(0x30426e64aee30e998c13c8ceecda3a77807dbead52bc2f3bf0eae851b4b710c1n),
      new Fr(0x113156a068f603023240c96b4da5474667db3b8711c521c748212a15bc034ea6n),
    );

    const [x, sign] = p.toXAndSign();
    const p2 = await Point.fromXAndSign(x, sign);

    expect(p.equals(p2)).toBeTruthy();
  });

  it('converts to and from buffer', async () => {
    const p = await Point.random();
    const p2 = Point.fromBuffer(p.toBuffer());

    expect(p.equals(p2)).toBeTruthy();
  });

  it('converts to and from compressed buffer', async () => {
    const p = await Point.random();
    const p2 = await Point.fromCompressedBuffer(p.toCompressedBuffer());

    expect(p.equals(p2)).toBeTruthy();
  });

  it('serializes from and to JSON', async () => {
    const p = await Point.random();
    const p2 = jsonParseWithSchema(jsonStringify(p), Point.schema);
    expect(p).toEqual(p2);
    expect(p2).toBeInstanceOf(Point);
  });
});
