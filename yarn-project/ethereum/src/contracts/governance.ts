import { EthAddress } from '@aztec/foundation/eth-address';
import { GovernanceAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  getContract,
} from 'viem';

import { type L1ContractAddresses } from '../l1_contract_addresses.js';
import { GovernanceProposerContract } from './governance_proposer.js';

export type L1GovernanceContractAddresses = Pick<
  L1ContractAddresses,
  'governanceAddress' | 'rollupAddress' | 'registryAddress' | 'governanceProposerAddress'
>;

export class GovernanceContract {
  private readonly governance: GetContractReturnType<typeof GovernanceAbi, PublicClient<HttpTransport, Chain>>;

  constructor(public readonly client: PublicClient<HttpTransport, Chain>, address: Hex) {
    this.governance = getContract({ address, abi: GovernanceAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.governance.address);
  }

  public async getProposer() {
    const governanceProposerAddress = EthAddress.fromString(await this.governance.read.governanceProposer());
    return new GovernanceProposerContract(this.client, governanceProposerAddress.toString());
  }

  public async getGovernanceAddresses(): Promise<L1GovernanceContractAddresses> {
    const governanceProposer = await this.getProposer();
    const [rollupAddress, registryAddress] = await Promise.all([
      governanceProposer.getRollupAddress(),
      governanceProposer.getRegistryAddress(),
    ]);
    return {
      governanceAddress: this.address,
      rollupAddress,
      registryAddress,
      governanceProposerAddress: governanceProposer.address,
    };
  }
}
