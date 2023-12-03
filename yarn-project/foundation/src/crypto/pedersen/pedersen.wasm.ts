import { BarretenbergSync, Fr } from '@aztec/bb.js';

/**
 * Init the bb singleton. This constructs (if not already) the barretenberg sync api within bb.js itself.
 * It takes about 100-200ms to initialise. It may not seem like much, but when in conjunction with many other things
 * initialising, developers may want to pick precisely when to incur this cost.
 * If in a test environment, we'll just do it on module load.
 */
export async function pedersenInit() {
  await BarretenbergSync.initSingleton();
}

if (process.env.NODE_ENV === 'test') {
  await pedersenInit();
}

/**
 * Create a pedersen commitment (point) from an array of input fields.
 * Left pads any inputs less than 32 bytes.
 */
export function pedersenCommit(input: Buffer[]) {
  if (!input.every(i => i.length <= 32)) {
    throw new Error('All input buffers must be <= 32 bytes.');
  }
  input = input.map(i => (i.length < 32 ? Buffer.concat([Buffer.alloc(32 - i.length, 0), i]) : i));
  const point = BarretenbergSync.getSingleton().pedersenCommit(input.map(i => new Fr(i)));
  // toBuffer returns Uint8Arrays (browser/worker-boundary friendly).
  // TODO: rename toTypedArray()?
  return [Buffer.from(point.x.toBuffer()), Buffer.from(point.y.toBuffer())];
}

/**
 * Create a pedersen hash (field) from an array of input fields.
 * Left pads any inputs less than 32 bytes.
 */
export function pedersenHash(input: Buffer[], index = 0) {
  if (!input.every(i => i.length <= 32)) {
    throw new Error('All input buffers must be <= 32 bytes.');
  }
  input = input.map(i => (i.length < 32 ? Buffer.concat([Buffer.alloc(32 - i.length, 0), i]) : i));
  return Buffer.from(
    BarretenbergSync.getSingleton()
      .pedersenHash(
        input.map(i => new Fr(i)),
        index,
      )
      .toBuffer(),
  );
}

/**
 * Create a pedersen hash from an arbitrary length buffer.
 */
export function pedersenHashBuffer(input: Buffer, index = 0) {
  return Buffer.from(BarretenbergSync.getSingleton().pedersenHashBuffer(input, index).toBuffer());
}
