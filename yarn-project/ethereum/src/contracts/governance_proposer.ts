import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  getContract,
} from 'viem';

export class GovernanceProposerContract {
  private readonly proposer: GetContractReturnType<typeof GovernanceProposerAbi, PublicClient<HttpTransport, Chain>>;

  constructor(public readonly client: PublicClient<HttpTransport, Chain>, address: Hex) {
    this.proposer = getContract({ address, abi: GovernanceProposerAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.proposer.address);
  }

  public async getRollupAddress() {
    return EthAddress.fromString(await this.proposer.read.getInstance());
  }

  @memoize
  public async getRegistryAddress() {
    return EthAddress.fromString(await this.proposer.read.REGISTRY());
  }

  public getQuorumSize() {
    return this.proposer.read.N();
  }

  public getRoundSize() {
    return this.proposer.read.M();
  }
}
