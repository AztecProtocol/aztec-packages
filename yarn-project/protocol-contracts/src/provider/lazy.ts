import { getCanonicalAuthRegistry } from '../auth-registry/lazy.js';
import { getCanonicalClassRegistry } from '../class-registry/lazy.js';
import { getCanonicalFeeJuice } from '../fee-juice/lazy.js';
import { getCanonicalInstanceRegistry } from '../instance-registry/lazy.js';
import { getCanonicalMultiCallEntrypoint } from '../multi-call-entrypoint/lazy.js';
import type { ProtocolContract } from '../protocol_contract.js';
import type { ProtocolContractName } from '../protocol_contract_data.js';
import { getCanonicalRouter } from '../router/lazy.js';
import type { ProtocolContractsProvider } from './protocol_contracts_provider.js';

export class LazyProtocolContractsProvider implements ProtocolContractsProvider {
  getProtocolContractArtifact(name: ProtocolContractName): Promise<ProtocolContract> {
    switch (name) {
      case 'AuthRegistry':
        return getCanonicalAuthRegistry();
      case 'ContractInstanceRegistry':
        return getCanonicalInstanceRegistry();
      case 'ContractClassRegistry':
        return getCanonicalClassRegistry();
      case 'MultiCallEntrypoint':
        return getCanonicalMultiCallEntrypoint();
      case 'FeeJuice':
        return getCanonicalFeeJuice();
      case 'Router':
        return getCanonicalRouter();
      default:
        throw new Error(`Unknown protocol contract name: ${name}`);
    }
  }
}
