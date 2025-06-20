import { EthAddress } from '@aztec/foundation/eth-address';
import { Fq, Fr, Point } from '@aztec/foundation/fields';

import { strict as assert } from 'assert';
import { Encoder, addExtension } from 'msgpackr';

import { AztecAddress } from '../aztec-address/index.js';

export function serializeWithMessagePack(obj: any): Buffer {
  setUpMessagePackExtensions();
  const encoder = new Encoder({
    // always encode JS objects as MessagePack maps
    // this makes it compatible with other MessagePack decoders
    useRecords: false,
    int64AsType: 'bigint',
  });
  return encoder.encode(obj);
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
  });
  addExtension({
    Class: Fq,
    write: (fq: Fq) => fq.toBuffer(),
  });
  // AztecAddress is a class that has a field in TS, but is itself a field in C++.
  addExtension({
    Class: AztecAddress,
    write: (addr: AztecAddress) => addr.toField(),
  });
  // Affine points are a mess, we do our best.
  addExtension({
    Class: Point,
    write: (p: Point) => {
      assert(!p.inf, 'Cannot serialize infinity');
      // TODO: should these be Frs?
      return { x: new Fq(p.x.toBigInt()), y: new Fq(p.y.toBigInt()) };
    },
  });
  // EthAddress is a class that has a buffer in TS, but is itself just a field in C++.
  addExtension({
    Class: EthAddress,
    write: (addr: EthAddress) => addr.toField().toBuffer(),
  });
  messagePackWasSetUp = true;
}
