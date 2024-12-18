import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import FeeJuiceJson from '../../artifacts/FeeJuice.json' assert { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import { type ProtocolContract } from '../protocol_contract.js';

export const FeeJuiceArtifact = loadContractArtifact(FeeJuiceJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export function getCanonicalFeeJuice(): ProtocolContract {
  if (!protocolContract) {
    protocolContract = makeProtocolContract('FeeJuice', FeeJuiceArtifact);
  }
  return protocolContract;
}
