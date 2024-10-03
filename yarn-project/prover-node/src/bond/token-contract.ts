import { EthAddress } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { IERC20Abi } from '@aztec/l1-artifacts';

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

const MAX_ALLOWANCE = (1n << 256n) - 1n;
const MIN_ALLOWANCE = 1n << 255n;

export class TokenContract {
  private token: GetContractReturnType<typeof IERC20Abi, WalletClient<HttpTransport, Chain, PrivateKeyAccount>>;
  private logger = createDebugLogger('aztec:prover-node:token-contract');

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
    this.token = getContract({ address: address.toString(), abi: IERC20Abi, client });
  }

  /**
   * Ensures the allowed address has near-maximum allowance, or sets it otherwise.
   * Returns once allowance tx is mined successfully.
   * @param allowed - Who to allow.
   */
  public async ensureAllowance(allowed: EthAddress) {
    const allowance = await this.token.read.allowance([this.getSenderAddress().toString(), allowed.toString()]);
    if (allowance < MIN_ALLOWANCE) {
      this.logger.verbose(`Approving max allowance for ${allowed.toString()}`);
      const hash = await this.token.write.approve([allowed.toString(), MAX_ALLOWANCE]);
      await this.client.waitForTransactionReceipt({ hash });
    }
  }

  /** Returns the sender address. */
  public getSenderAddress(): EthAddress {
    return EthAddress.fromString(this.client.account.address);
  }

  /** Returns the balance of the sender. */
  public async getBalance() {
    return await this.token.read.balanceOf([this.getSenderAddress().toString()]);
  }
}
