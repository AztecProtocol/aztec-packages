import { AztecAddress, CircuitsWasm } from '../index.js';
import { Address, Field } from './msgpack_bind_mapping.js';

export async function abisComputeContractAddress(
  wasm: CircuitsWasm,
  address: Address,
  field1: Field,
  field2: Field,
  field3: Field,
): Promise<Address> {
  const encoded = await wasm.callCbind('abis__compute_contract_address', [
    address.toBuffer(),
    field1.toBuffer(),
    field2.toBuffer(),
    field3.toBuffer(),
  ]);
  console.log({ encoded });
  return AztecAddress.fromBuffer(Buffer.from(encoded));
}
