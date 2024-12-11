import { createLogger } from '@aztec/foundation/log';

import { type EscrowContract } from './escrow-contract.js';
import { type TokenContract } from './token-contract.js';

export class BondManager {
  private readonly logger = createLogger('prover-node:bond-manager');

  constructor(
    private readonly tokenContract: TokenContract,
    private readonly escrowContract: EscrowContract,
    /** Minimum escrowed bond. A top-up will be issued once this threshold is hit. */
    public minimumAmount: bigint,
    /** Target escrowed bond. Top-up will target this value. */
    public targetAmount: bigint,
  ) {}

  /**
   * Ensures the bond is at least minimumBond, or sends a tx to deposit the remaining to reach targetBond.
   * @param overrideMinimum - Override the minimum bond threshold. Also overrides target if it is higher.
   */
  public async ensureBond(overrideMinimum?: bigint) {
    const minimum = overrideMinimum ?? this.minimumAmount;
    const target = overrideMinimum && overrideMinimum > this.targetAmount ? overrideMinimum : this.targetAmount;

    try {
      const current = await this.escrowContract.getProverDeposit();
      if (current >= minimum) {
        this.logger.debug(`Current prover bond ${current} is above minimum ${minimum}`);
        return;
      }

      const topUpAmount = target - current;
      this.logger.verbose(`Prover bond top-up ${topUpAmount} required to get ${current} to target ${target}`);

      const balance = await this.tokenContract.getBalance();
      if (balance < topUpAmount) {
        throw new Error(`Not enough balance to top-up prover bond: ${balance} < ${topUpAmount}`);
      }

      await this.tokenContract.ensureAllowance(this.escrowContract.getEscrowAddress());
      await this.escrowContract.depositProverBond(topUpAmount);
      this.logger.verbose(`Prover bond top-up of ${topUpAmount} completed`);
    } catch (err) {
      throw new Error(`Could not set prover bond: ${err}`);
    }
  }
}
