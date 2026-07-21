import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';

import { serializeContractInstance } from './cdb_ipc_server.js';

describe('cdb_ipc_server', () => {
  it('serializes the complete public keys shape expected by the C++ AVM', async () => {
    const instance = (await SerializableContractInstance.random()).withAddress(await AztecAddress.random());

    const serialized = serializeContractInstance(instance);
    const publicKeys = serialized.publicKeys as Record<string, Buffer | Record<string, Buffer>>;

    expect(publicKeys).toEqual({
      npkMHash: instance.publicKeys.npkMHash.toBuffer(),
      ivpkM: {
        x: instance.publicKeys.ivpkM.x.toBuffer(),
        y: instance.publicKeys.ivpkM.y.toBuffer(),
      },
      ovpkMHash: instance.publicKeys.ovpkMHash.toBuffer(),
      tpkMHash: instance.publicKeys.tpkMHash.toBuffer(),
      mspkMHash: instance.publicKeys.mspkMHash.toBuffer(),
      fbpkMHash: instance.publicKeys.fbpkMHash.toBuffer(),
    });
  });
});
