import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';

import { beforeEach } from '@jest/globals';

import type { AvmContext } from '../avm_context.js';
import { Field, Uint1, Uint32 } from '../avm_memory_types.js';
import { EcAddPointNotOnCurveError } from '../errors.js';
import { initContext } from '../fixtures/initializers.js';
import { EcAdd } from './ec_add.js';

describe('EC Instructions', () => {
  let context: AvmContext;

  beforeEach(() => {
    context = initContext();
  });

  describe('EcAdd', () => {
    it('Should (de)serialize correctly', () => {
      const buf = Buffer.from([
        EcAdd.opcode, // opcode
        ...Buffer.from('1234', 'hex'), // indirect
        ...Buffer.from('1235', 'hex'), // p1x
        ...Buffer.from('1236', 'hex'), // p1y
        ...Buffer.from('0000', 'hex'), // p1IsInfinite
        ...Buffer.from('1237', 'hex'), // p2x
        ...Buffer.from('1238', 'hex'), // p2y
        ...Buffer.from('0001', 'hex'), // p2IsInfinite
        ...Buffer.from('1239', 'hex'), // dstOffset
      ]);
      const inst = new EcAdd(
        /*addressing_mode=*/ 0x1234,
        /*p1X=*/ 0x1235,
        /*p1Y=*/ 0x1236,
        /*p1IsInfinite=*/ 0,
        /*p2X=*/ 0x1237,
        /*p2Y=*/ 0x1238,
        /*p2IsInfinite=*/ 1,
        /*dstOffset=*/ 0x1239,
      );

      expect(EcAdd.fromBuffer(buf)).toEqual(inst);
      expect(inst.toBuffer()).toEqual(buf);
    });

    it(`Should double correctly`, async () => {
      const x = new Field(Grumpkin.generator.x);
      const y = new Field(Grumpkin.generator.y);
      const zero = new Uint1(0);

      context.machineState.memory.set(0, x);
      context.machineState.memory.set(1, y);
      context.machineState.memory.set(2, zero);
      context.machineState.memory.set(3, x);
      context.machineState.memory.set(4, y);
      context.machineState.memory.set(5, zero);
      // context.machineState.memory.set(6, new Uint32(6));

      await new EcAdd(
        /*addressing_mode=*/ 0,
        /*p1X=*/ 0,
        /*p1Y=*/ 1,
        /*p1IsInfinite=*/ 2,
        /*p2X=*/ 3,
        /*p2Y=*/ 4,
        /*p2IsInfinite=*/ 5,
        /*dstOffset=*/ 6,
      ).execute(context);

      const pIsInfinite = context.machineState.memory.get(8).toNumber() === 1;
      const actual = new Point(
        context.machineState.memory.get(6).toFr(),
        context.machineState.memory.get(7).toFr(),
        pIsInfinite,
      );
      const expected = await Grumpkin.add(Grumpkin.generator, Grumpkin.generator);
      expect(actual).toEqual(expected);
      expect(context.machineState.memory.get(8).toFr().equals(Fr.ZERO)).toBe(true);
    });

    it('Should add correctly', async () => {
      const G2 = await Grumpkin.add(Grumpkin.generator, Grumpkin.generator);
      const zero = new Uint1(0);

      const x1 = new Field(Grumpkin.generator.x);
      const y1 = new Field(Grumpkin.generator.y);
      const x2 = new Field(G2.x);
      const y2 = new Field(G2.y);

      context.machineState.memory.set(0, x1);
      context.machineState.memory.set(1, y1);
      context.machineState.memory.set(2, zero);
      context.machineState.memory.set(3, x2);
      context.machineState.memory.set(4, y2);
      context.machineState.memory.set(5, zero);
      context.machineState.memory.set(6, new Uint32(6));

      await new EcAdd(
        /*addressing_mode=*/ 0,
        /*p1X=*/ 0,
        /*p1Y=*/ 1,
        /*p1IsInfinite=*/ 2,
        /*p2X=*/ 3,
        /*p2Y=*/ 4,
        /*p2IsInfinite=*/ 5,
        /*dstOffset=*/ 6,
      ).execute(context);

      const actual = new Point(
        context.machineState.memory.get(6).toFr(),
        context.machineState.memory.get(7).toFr(),
        false,
      );
      const G3 = await Grumpkin.add(Grumpkin.generator, G2);
      expect(actual).toEqual(G3);
      expect(context.machineState.memory.get(8).toFr().equals(Fr.ZERO)).toBe(true);
    });

    it('Should add correctly with rhs being infinity', async () => {
      const zero = new Uint1(0);
      const one = new Uint1(1);

      const x = new Field(Grumpkin.generator.x);
      const y = new Field(Grumpkin.generator.y);

      // Point 1 is not infinity
      context.machineState.memory.set(0, x);
      context.machineState.memory.set(1, y);
      context.machineState.memory.set(2, zero);
      // Point 2 is infinity
      context.machineState.memory.set(3, x);
      context.machineState.memory.set(4, y);
      context.machineState.memory.set(5, one);
      context.machineState.memory.set(6, new Uint32(6));

      await new EcAdd(
        /*addressing_mode=*/ 0,
        /*p1X=*/ 0,
        /*p1Y=*/ 1,
        /*p1IsInfinite=*/ 2,
        /*p2X=*/ 3,
        /*p2Y=*/ 4,
        /*p2IsInfinite=*/ 5,
        /*dstOffset=*/ 6,
      ).execute(context);

      expect([
        context.machineState.memory.get(6).toFr(),
        context.machineState.memory.get(7).toFr(),
        context.machineState.memory.get(8).toNumber(),
      ]).toEqual([x.toFr(), y.toFr(), 0]);
    });

    it('Should add correctly with lhs being infinity', async () => {
      const zero = new Uint1(0);
      const one = new Uint1(1);

      const x = new Field(Grumpkin.generator.x);
      const y = new Field(Grumpkin.generator.y);

      // Point 1 is infinity
      context.machineState.memory.set(0, x);
      context.machineState.memory.set(1, y);
      context.machineState.memory.set(2, one);
      // Point 2 is not infinity
      context.machineState.memory.set(3, x);
      context.machineState.memory.set(4, y);
      context.machineState.memory.set(5, zero);
      context.machineState.memory.set(6, new Uint32(6));

      await new EcAdd(
        /*addressing_mode=*/ 0,
        /*p1X=*/ 0,
        /*p1Y=*/ 1,
        /*p1IsInfinite=*/ 2,
        /*p2X=*/ 3,
        /*p2Y=*/ 4,
        /*p2IsInfinite=*/ 5,
        /*dstOffset=*/ 6,
      ).execute(context);

      expect([
        context.machineState.memory.get(6).toFr(),
        context.machineState.memory.get(7).toFr(),
        context.machineState.memory.get(8).toNumber(),
      ]).toEqual([x.toFr(), y.toFr(), 0]);
    });

    it('Should add correctly with both being infinity', async () => {
      const one = new Uint1(1);

      const x = new Field(Grumpkin.generator.x);
      const y = new Field(Grumpkin.generator.y);

      // Point 1 is infinity
      context.machineState.memory.set(0, x);
      context.machineState.memory.set(1, y);
      context.machineState.memory.set(2, one);
      // Point 2 is infinity
      context.machineState.memory.set(3, x);
      context.machineState.memory.set(4, y);
      context.machineState.memory.set(5, one);
      context.machineState.memory.set(6, new Uint32(6));

      await new EcAdd(
        /*addressing_mode=*/ 0,
        /*p1X=*/ 0,
        /*p1Y=*/ 1,
        /*p1IsInfinite=*/ 2,
        /*p2X=*/ 3,
        /*p2Y=*/ 4,
        /*p2IsInfinite=*/ 5,
        /*dstOffset=*/ 6,
      ).execute(context);

      expect([
        context.machineState.memory.get(6).toFr(),
        context.machineState.memory.get(7).toFr(),
        context.machineState.memory.get(8).toNumber(),
      ]).toEqual([Fr.ZERO, Fr.ZERO, 1]);
    });

    it('Should add correctly with none infinity adding up to infinity', async () => {
      const zero = new Uint1(0);

      // Point 1 is a "random" point on the curve
      const x1 = new Field(2165030248772332382647339664685760681662697934905450801078761197378150920554n);
      const y1 = new Field(1518479793551399970960577643223827307749147426195887130444945641264602004320n);
      // Point 2 is negation of point 1
      const x2 = new Field(2165030248772332382647339664685760681662697934905450801078761197378150920554n);
      const y2 = new Field(20369763078287875251285828102033447780799216974220147213253258545311206491297n);

      context.machineState.memory.set(0, x1);
      context.machineState.memory.set(1, y1);
      context.machineState.memory.set(2, zero);

      context.machineState.memory.set(3, x2);
      context.machineState.memory.set(4, y2);
      context.machineState.memory.set(5, zero);
      context.machineState.memory.set(6, new Uint32(6));

      await new EcAdd(
        /*addressing_mode=*/ 0,
        /*p1X=*/ 0,
        /*p1Y=*/ 1,
        /*p1IsInfinite=*/ 2,
        /*p2X=*/ 3,
        /*p2Y=*/ 4,
        /*p2IsInfinite=*/ 5,
        /*dstOffset=*/ 6,
      ).execute(context);

      expect([
        context.machineState.memory.get(6).toFr(),
        context.machineState.memory.get(7).toFr(),
        context.machineState.memory.get(8).toNumber(),
      ]).toEqual([Fr.ZERO, Fr.ZERO, 1]);
    });
  });

  describe('EcAdd should throw an error when a point is not on the curve', () => {
    it('Should throw an error when point1 is not on the curve', async () => {
      const validPoint = await Point.random();
      const p1xOffset = 0;
      const p1yOffset = 1;
      const p1IsInfiniteOffset = 2;
      const p2xOffset = 3;
      const p2yOffset = 4;
      const p2IsInfiniteOffset = 5;
      const dstOffset = 6;
      context.machineState.memory.set(p1xOffset, new Field(new Fr(1))); // p1x (point is invalid)
      context.machineState.memory.set(p1yOffset, new Field(new Fr(1))); // p1y (point is invalid)
      context.machineState.memory.set(p1IsInfiniteOffset, new Uint1(0)); // p1IsInfinite
      context.machineState.memory.set(p2xOffset, new Field(validPoint.x)); // p2x
      context.machineState.memory.set(p2yOffset, new Field(validPoint.y)); // p2y
      context.machineState.memory.set(p2IsInfiniteOffset, new Uint1(validPoint.isInfinite ? 1 : 0)); // p2IsInfinite

      await expect(
        new EcAdd(
          /*addressing_mode=*/ 0,
          p1xOffset,
          p1yOffset,
          p1IsInfiniteOffset,
          p2xOffset,
          p2yOffset,
          p2IsInfiniteOffset,
          dstOffset,
        ).execute(context),
      ).rejects.toThrow(EcAddPointNotOnCurveError);
    });

    it('Should throw an error when point2 is not on the curve', async () => {
      const validPoint = await Point.random();
      const p1xOffset = 0;
      const p1yOffset = 1;
      const p1IsInfiniteOffset = 2;
      const p2xOffset = 3;
      const p2yOffset = 4;
      const p2IsInfiniteOffset = 5;
      const dstOffset = 6;
      context.machineState.memory.set(p1xOffset, new Field(validPoint.x)); // p1x
      context.machineState.memory.set(p1yOffset, new Field(validPoint.y)); // p1y
      context.machineState.memory.set(p1IsInfiniteOffset, new Uint1(validPoint.isInfinite ? 1 : 0)); // p1IsInfinite
      context.machineState.memory.set(p2xOffset, new Field(new Fr(1))); // p2x (point is invalid)
      context.machineState.memory.set(p2yOffset, new Field(new Fr(1))); // p2y (point is invalid)
      context.machineState.memory.set(p2IsInfiniteOffset, new Uint1(0)); // p2IsInfinite

      await expect(
        new EcAdd(
          /*addressing_mode=*/ 0,
          p1xOffset,
          p1yOffset,
          p1IsInfiniteOffset,
          p2xOffset,
          p2yOffset,
          p2IsInfiniteOffset,
          dstOffset,
        ).execute(context),
      ).rejects.toThrow(EcAddPointNotOnCurveError);
    });
  });
});
