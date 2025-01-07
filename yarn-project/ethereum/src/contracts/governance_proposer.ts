import { memoize } from '@aztec/foundation/decorators';
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
  private readonly governanceProposer: GetContractReturnType<
    typeof GovernanceProposerAbi,
    PublicClient<HttpTransport, Chain | undefined>
  >;

  constructor(client: PublicClient, address: Hex) {
    this.governanceProposer = getContract({ address, abi: GovernanceProposerAbi, client });
  }

  @memoize
  getRoundDuration(): Promise<bigint> {
    return this.governanceProposer.read.M();
  }

  @memoize
  getQuorumSize(): Promise<bigint> {
    return this.governanceProposer.read.N();
  }

  computeRound(slot: bigint) {
    return this.governanceProposer.read.computeRound([slot]);
  }

  getRoundInfo(rollupAddress: Hex, round: bigint) {
    return this.governanceProposer.read.rounds([rollupAddress, round]);
  }

  getProposalVotes(rollupAddress: Hex, round: bigint, proposal: Hex) {
    return this.governanceProposer.read.yeaCount([rollupAddress, round, proposal]);
  }
}
