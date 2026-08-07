import { Fr } from '@aztec/aztec.js/fields';
import { protocolContractsHash } from '@aztec/protocol-contracts';

describe('Protocol contracts compatibility', () => {
  it('has expected protocol contracts hash', () => {
    expect(protocolContractsHash).toEqual(
      Fr.fromHexString('0x2f4fe1e640100dd7e077e98acb92f30f06a8c483d0e20acc059cc4e5761f414c'),
    );
  });
});
