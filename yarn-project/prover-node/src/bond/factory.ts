import { type EthAddress } from '@aztec/circuits.js';
import { type L1Clients } from '@aztec/ethereum';
import { compact } from '@aztec/foundation/collection';

import { BondManager } from './bond-manager.js';
import { type ProverBondManagerConfig, getProverBondManagerConfigFromEnv } from './config.js';
import { EscrowContract } from './escrow-contract.js';
import { TokenContract } from './token-contract.js';

export async function createBondManager(
  escrowContractAddress: EthAddress,
  client: L1Clients['walletClient'],
  overrides: Partial<ProverBondManagerConfig> = {},
) {
  const config = { ...getProverBondManagerConfigFromEnv(), ...compact(overrides) };
  const { proverMinimumEscrowAmount: minimumStake, proverTargetEscrowAmount: maybeTargetStake } = config;
  const targetStake = maybeTargetStake ?? minimumStake * 2n;

  const escrow = new EscrowContract(client, escrowContractAddress);

  const tokenContractAddress = await escrow.getTokenAddress();
  const token = new TokenContract(client, tokenContractAddress);

  // Ensure the prover has enough balance to cover escrow and try to mint otherwise if on a dev environment
  await token.ensureBalance(targetStake * 2n);

  return new BondManager(token, escrow, minimumStake, targetStake);
}
