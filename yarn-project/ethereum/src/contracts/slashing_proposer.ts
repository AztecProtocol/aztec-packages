import { EthAddress } from '@aztec/foundation/eth-address';
import { SlashingProposerAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  getContract,
} from 'viem';

export class SlashingProposerContract {
  private readonly proposer: GetContractReturnType<typeof SlashingProposerAbi, PublicClient<HttpTransport, Chain>>;

  constructor(public readonly client: PublicClient<HttpTransport, Chain>, address: Hex) {
    this.proposer = getContract({ address, abi: SlashingProposerAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.proposer.address);
  }

  public getQuorumSize() {
    return this.proposer.read.N();
  }

  public getRoundSize() {
    return this.proposer.read.M();
  }
}
