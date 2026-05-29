import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { EthAddress } from '@aztec/foundation/eth-address';

import { strict as assert } from 'assert';
import { Decoder, Encoder, addExtension } from 'msgpackr';

import { AztecAddress } from '../aztec-address/index.js';

export function serializeWithMessagePack(obj: any): Buffer {
  setUpMessagePackExtensions();
  const encoder = new Encoder({
    // always encode JS objects as MessagePack maps
    // this makes it compatible with other MessagePack decoders
    useRecords: false,
    int64AsType: 'bigint',
    largeBigIntToString: true,
  });
  return encoder.encode(obj);
}

// This deserializes into a JS object. If you want a specific
// class, you need to use zod to parse it into the specific class.
// You can use T.schema.parse() for that.
export function deserializeFromMessagePack(buffer: Buffer): any {
  setUpMessagePackExtensions();
  const decoder = new Decoder({
    useRecords: false,
    int64AsType: 'bigint',
    largeBigIntToString: true,
  });
  return decoder.decode(buffer);
}

let messagePackWasSetUp = false;
function setUpMessagePackExtensions() {
  if (messagePackWasSetUp) {
    return;
  }
  // C++ Fr and Fq classes work well with the buffer serialization.
  addExtension({
    Class: Fr,
    write: (fr: Fr) => fr.toBuffer(),
    read: (data: Buffer) => Fr.fromBuffer(data),
  });
  addExtension({
    Class: Fq,
    write: (fq: Fq) => fq.toBuffer(),
    read: (data: Buffer) => Fq.fromBuffer(data),
  });
  // AztecAddress is a class that has a field in TS, but is itself a field in C++.
  addExtension({
    Class: AztecAddress,
    write: (addr: AztecAddress) => addr.toField(),
    read: (data: Fr | Buffer) => {
      // If C++ sent it as Fr, wrap it. If as buffer, construct from buffer.
      if (data instanceof Fr) {
        return new AztecAddress(data);
      }
      return new AztecAddress(Fr.fromBuffer(data));
    },
  });
  // Affine points are a mess, we do our best.
  addExtension({
    Class: Point,
    write: (p: Point) => {
      // TODO: Now that we use a 2 elt point representation, we should be able to handle infs here.
      // However this opens possible bad paths with public keys and requires sanitised conversion between
      // BB's inf representation (see below), and ours/Noir's (0, 0), and empty points from BB, when inf
      // does not actually pass through.
      assert(!p.isInfinite, 'Cannot serialize infinity');
      return { x: new Fq(p.x.toBigInt()), y: new Fq(p.y.toBigInt()) };
    },
    read: (data: { x: Fq; y: Fq }) => {
      // Note: BB encodes infinity as x == y == Buffer of all ones.
      // Infinity should never pass through here, but for correctness:
      const ALL_ONES = (1n << 256n) - 1n;
      if (data.x.toBigInt() === ALL_ONES && data.y.toBigInt() === ALL_ONES) {
        return Point.INFINITY;
      }
      // Convert Fq back to Fr for Point constructor
      return new Point(new Fr(data.x.toBigInt()), new Fr(data.y.toBigInt()));
    },
  });
  // EthAddress is a class that has a buffer in TS, but is itself just a field in C++.
  addExtension({
    Class: EthAddress,
    write: (addr: EthAddress) => addr.toField().toBuffer(),
    read: (data: Buffer) => EthAddress.fromField(Fr.fromBuffer(data)),
  });
  messagePackWasSetUp = true;
}
