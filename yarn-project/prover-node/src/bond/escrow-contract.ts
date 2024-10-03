import { EthAddress } from '@aztec/circuits.js';
import { IProofCommitmentEscrowAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type Client,
  type GetContractReturnType,
  type HttpTransport,
  type PrivateKeyAccount,
  type PublicActions,
  type PublicRpcSchema,
  type WalletActions,
  type WalletClient,
  type WalletRpcSchema,
  getContract,
} from 'viem';

export class EscrowContract {
  private escrow: GetContractReturnType<
    typeof IProofCommitmentEscrowAbi,
    WalletClient<HttpTransport, Chain, PrivateKeyAccount>
  >;

  constructor(
    private readonly client: Client<
      HttpTransport,
      Chain,
      PrivateKeyAccount,
      [...WalletRpcSchema, ...PublicRpcSchema],
      PublicActions<HttpTransport, Chain> & WalletActions<Chain, PrivateKeyAccount>
    >,
    address: EthAddress,
  ) {
    this.escrow = getContract({ address: address.toString(), abi: IProofCommitmentEscrowAbi, client });
  }

  /** Returns the deposit of the publisher sender address on the proof commitment escrow contract. */
  public async getProverDeposit() {
    return await this.escrow.read.deposits([this.getSenderAddress().toString()]);
  }

  /**
   * Deposits the given amount of tokens into the proof commitment escrow contract. Returns once the tx is mined.
   * @param amount - The amount to deposit.
   */
  public async depositProverBond(amount: bigint) {
    const hash = await this.escrow.write.deposit([amount]);
    await this.client.waitForTransactionReceipt({ hash });
  }

  /** Returns the sender address for the client. */
  public getSenderAddress(): EthAddress {
    return EthAddress.fromString(this.client.account.address);
  }

  public getEscrowAddress(): EthAddress {
    return EthAddress.fromString(this.escrow.address);
  }

  public async getTokenAddress(): Promise<EthAddress> {
    return EthAddress.fromString(await this.escrow.read.token());
  }
}
