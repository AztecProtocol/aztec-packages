import { getCanonicalAuthRegistry } from '../auth-registry/lazy.js';
import { getCanonicalClassRegisterer } from '../class-registerer/lazy.js';
import { getCanonicalFeeJuice } from '../fee-juice/lazy.js';
import { getCanonicalInstanceDeployer } from '../instance-deployer/lazy.js';
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
      case 'ContractInstanceDeployer':
        return getCanonicalInstanceDeployer();
      case 'ContractClassRegisterer':
        return getCanonicalClassRegisterer();
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
