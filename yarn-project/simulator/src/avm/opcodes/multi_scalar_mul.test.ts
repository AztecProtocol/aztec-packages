import { Fq, Fr, Point } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { timesParallel } from '@aztec/foundation/collection';

import { type AvmContext } from '../avm_context.js';
import { Field, type MemoryValue, Uint1, Uint32 } from '../avm_memory_types.js';
import { MSMPointNotOnCurveError, MSMPointsLengthError } from '../errors.js';
import { initContext } from '../fixtures/index.js';
import { MultiScalarMul } from './multi_scalar_mul.js';

describe('MultiScalarMul Opcode', () => {
  let context: AvmContext;

  beforeEach(async () => {
    context = initContext();
  });
  it('Should (de)serialize correctly', () => {
    const buf = Buffer.from([
      MultiScalarMul.opcode, // opcode
      7, // indirect
      ...Buffer.from('1234', 'hex'), // pointsOffset
      ...Buffer.from('2345', 'hex'), // scalars Offset
      ...Buffer.from('3456', 'hex'), // outputOffset
      ...Buffer.from('4567', 'hex'), // pointsLengthOffset
    ]);
    const inst = new MultiScalarMul(
      /*indirect=*/ 7,
      /*pointsOffset=*/ 0x1234,
      /*scalarsOffset=*/ 0x2345,
      /*outputOffset=*/ 0x3456,
      /*pointsLengthOffset=*/ 0x4567,
    );

    expect(MultiScalarMul.deserialize(buf)).toEqual(inst);
    expect(inst.serialize()).toEqual(buf);
  });

  it('Should perform msm correctly - direct', async () => {
    const indirect = 0;
    const grumpkin = new Grumpkin();
    // We need to ensure points are actually on curve, so we just use the generator
    // In future we could use a random point, for now we create an array of [G, 2G, 3G]
    const points = await timesParallel(3, i => grumpkin.mul(grumpkin.generator(), new Fq(i + 1)));

    // Pick some big scalars to test the edge cases
    const scalars = [new Fq(Fq.MODULUS - 1n), new Fq(Fq.MODULUS - 2n), new Fq(1n)];
    const pointsReadLength = points.length * 3; // multiplied by 3 since we will store them as triplet in avm memory
    const scalarsLength = scalars.length * 2; // multiplied by 2 since we will store them as lo and hi limbs in avm memory
    // Transform the points and scalars into the format that we will write to memory
    // We just store the x and y coordinates here, and handle the infinities when we write to memory
    const storedScalars: Field[] = scalars.flatMap(s => [new Field(s.lo), new Field(s.hi)]);
    // Points are stored as [x1, y1, inf1, x2, y2, inf2, ...] where the types are [Field, Field, Uint8, Field, Field, Uint8, ...]
    const storedPoints: MemoryValue[] = points
      .map(p => p.toFields())
      .flatMap(([x, y, inf]) => [new Field(x), new Field(y), new Uint1(inf.toNumber())]);
    const pointsOffset = 0;
    context.machineState.memory.setSlice(pointsOffset, storedPoints);
    // Store scalars
    const scalarsOffset = pointsOffset + pointsReadLength;
    context.machineState.memory.setSlice(scalarsOffset, storedScalars);
    // Store length of points to read
    const pointsLengthOffset = scalarsOffset + scalarsLength;
    context.machineState.memory.set(pointsLengthOffset, new Uint32(pointsReadLength));
    const outputOffset = pointsLengthOffset + 1;

    await new MultiScalarMul(indirect, pointsOffset, scalarsOffset, outputOffset, pointsLengthOffset).execute(context);

    const result = context.machineState.memory.getSlice(outputOffset, 3).map(r => r.toFr());

    // We write it out explicitly here
    let expectedResult = await grumpkin.mul(points[0], scalars[0]);
    expectedResult = await grumpkin.add(expectedResult, await grumpkin.mul(points[1], scalars[1]));
    expectedResult = await grumpkin.add(expectedResult, await grumpkin.mul(points[2], scalars[2]));

    expect(result).toEqual([expectedResult.x, expectedResult.y, new Fr(0n)]);
  });

  it('Should perform msm correctly - indirect', async () => {
    const indirect = 7;
    const grumpkin = new Grumpkin();
    // We need to ensure points are actually on curve, so we just use the generator
    // In future we could use a random point, for now we create an array of [G, 2G, 3G]
    const points = await timesParallel(3, i => grumpkin.mul(grumpkin.generator(), new Fq(i + 1)));

    // Pick some big scalars to test the edge cases
    const scalars = [new Fq(Fq.MODULUS - 1n), new Fq(Fq.MODULUS - 2n), new Fq(1n)];
    const pointsReadLength = points.length * 3; // multiplied by 3 since we will store them as triplet in avm memory
    const scalarsLength = scalars.length * 2; // multiplied by 2 since we will store them as lo and hi limbs in avm memory
    // Transform the points and scalars into the format that we will write to memory
    // We just store the x and y coordinates here, and handle the infinities when we write to memory
    const storedScalars: Field[] = scalars.flatMap(s => [new Field(s.lo), new Field(s.hi)]);
    // Points are stored as [x1, y1, inf1, x2, y2, inf2, ...] where the types are [Field, Field, Uint8, Field, Field, Uint8, ...]
    const storedPoints: MemoryValue[] = points
      .map(p => p.toFields())
      .flatMap(([x, y, inf]) => [new Field(x), new Field(y), new Uint1(inf.toNumber())]);
    const pointsOffset = 0;
    context.machineState.memory.setSlice(pointsOffset, storedPoints);
    // Store scalars
    const scalarsOffset = pointsOffset + pointsReadLength;
    context.machineState.memory.setSlice(scalarsOffset, storedScalars);
    // Store length of points to read
    const pointsLengthOffset = scalarsOffset + scalarsLength;
    context.machineState.memory.set(pointsLengthOffset, new Uint32(pointsReadLength));
    const outputOffset = pointsLengthOffset + 1;

    // Set up the indirect pointers
    const pointsIndirectOffset = outputOffset + 3; /* 3 since the output is a triplet */
    const scalarsIndirectOffset = pointsIndirectOffset + 1;
    const outputIndirectOffset = scalarsIndirectOffset + 1;

    context.machineState.memory.set(pointsIndirectOffset, new Uint32(pointsOffset));
    context.machineState.memory.set(scalarsIndirectOffset, new Uint32(scalarsOffset));
    context.machineState.memory.set(outputIndirectOffset, new Uint32(outputOffset));

    await new MultiScalarMul(
      indirect,
      pointsIndirectOffset,
      scalarsIndirectOffset,
      outputIndirectOffset,
      pointsLengthOffset,
    ).execute(context);

    const result = context.machineState.memory.getSlice(outputOffset, 3).map(r => r.toFr());

    // We write it out explicitly here
    let expectedResult = await grumpkin.mul(points[0], scalars[0]);
    expectedResult = await grumpkin.add(expectedResult, await grumpkin.mul(points[1], scalars[1]));
    expectedResult = await grumpkin.add(expectedResult, await grumpkin.mul(points[2], scalars[2]));

    expect(result).toEqual([expectedResult.x, expectedResult.y, new Fr(0n)]);
  });

  it('Should throw an error if points length is not a multiple of 3', async () => {
    const indirect = 0;

    // No need to set up points nor scalars as it is expected to fail before any processing of them.
    const pointsReadLength = 17; // Not multiple of 3
    const pointsOffset = 0;
    const scalarsOffset = 20;
    const pointsLengthOffset = 100;
    const outputOffset = 120;

    context.machineState.memory.set(pointsLengthOffset, new Uint32(pointsReadLength));

    await expect(
      new MultiScalarMul(indirect, pointsOffset, scalarsOffset, outputOffset, pointsLengthOffset).execute(context),
    ).rejects.toThrow(MSMPointsLengthError);
  });

  it('Should throw an error if a point is not on Grumpkin curve', async () => {
    const indirect = 0;
    const grumpkin = new Grumpkin();
    // We need to ensure points are actually on curve, so we just use the generator
    // In future we could use a random point, for now we create an array of [G, 2G, NOT_ON_CURVE]
    const points = await timesParallel(2, i => grumpkin.mul(grumpkin.generator(), new Fq(i + 1)));
    points.push(new Point(new Fr(13), new Fr(14), false));

    const scalars = [new Fq(5n), new Fq(3n), new Fq(1n)];
    const pointsReadLength = points.length * 3; // multiplied by 3 since we will store them as triplet in avm memory
    const scalarsLength = scalars.length * 2; // multiplied by 2 since we will store them as lo and hi limbs in avm memory
    // Transform the points and scalars into the format that we will write to memory
    // We just store the x and y coordinates here, and handle the infinities when we write to memory
    const storedScalars: Field[] = scalars.flatMap(s => [new Field(s.lo), new Field(s.hi)]);
    // Points are stored as [x1, y1, inf1, x2, y2, inf2, ...] where the types are [Field, Field, Uint8, Field, Field, Uint8, ...]
    const storedPoints: MemoryValue[] = points
      .map(p => p.toFields())
      .flatMap(([x, y, inf]) => [new Field(x), new Field(y), new Uint1(inf.toNumber())]);
    const pointsOffset = 0;
    context.machineState.memory.setSlice(pointsOffset, storedPoints);
    // Store scalars
    const scalarsOffset = pointsOffset + pointsReadLength;
    context.machineState.memory.setSlice(scalarsOffset, storedScalars);
    // Store length of points to read
    const pointsLengthOffset = scalarsOffset + scalarsLength;
    context.machineState.memory.set(pointsLengthOffset, new Uint32(pointsReadLength));
    const outputOffset = pointsLengthOffset + 1;

    await expect(
      new MultiScalarMul(indirect, pointsOffset, scalarsOffset, outputOffset, pointsLengthOffset).execute(context),
    ).rejects.toThrow(MSMPointNotOnCurveError);
  });
});
