import type { ProtocolContract } from '../protocol_contract.js';
import type { ProtocolContractName } from '../protocol_contract_data.js';

/** Returns the canonical deployment of a given artifact. */
export interface ProtocolContractsProvider {
  getProtocolContractArtifact(name: ProtocolContractName): Promise<ProtocolContract>;
}
