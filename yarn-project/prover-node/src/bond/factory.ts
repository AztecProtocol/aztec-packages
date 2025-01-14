import { EthAddress } from '@aztec/circuits.js';
import { compact } from '@aztec/foundation/collection';
import { type RollupAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type Client,
  type GetContractReturnType,
  type HttpTransport,
  type PrivateKeyAccount,
  type PublicActions, // type PublicClient,
  type PublicRpcSchema,
  type WalletActions,
  type WalletClient,
  type WalletRpcSchema,
} from 'viem';

import { BondManager } from './bond-manager.js';
import { type ProverBondManagerConfig, getProverBondManagerConfigFromEnv } from './config.js';
import { EscrowContract } from './escrow-contract.js';
import { TokenContract } from './token-contract.js';

export async function createBondManager(
  rollupContract: GetContractReturnType<typeof RollupAbi, WalletClient<HttpTransport, Chain, PrivateKeyAccount>>,
  client: Client<
    HttpTransport,
    Chain,
    PrivateKeyAccount,
    [...WalletRpcSchema, ...PublicRpcSchema],
    PublicActions<HttpTransport, Chain> & WalletActions<Chain, PrivateKeyAccount>
  >,
  overrides: Partial<ProverBondManagerConfig> = {},
) {
  const config = { ...getProverBondManagerConfigFromEnv(), ...compact(overrides) };
  const { proverMinimumEscrowAmount: minimumStake, proverTargetEscrowAmount: maybeTargetStake } = config;
  const targetStake = maybeTargetStake ?? minimumStake * 2n;

  const escrowContractAddress = EthAddress.fromString(await rollupContract.read.PROOF_COMMITMENT_ESCROW());
  const escrow = new EscrowContract(client, escrowContractAddress);

  const tokenContractAddress = await escrow.getTokenAddress();
  const token = new TokenContract(client, tokenContractAddress);

  // Ensure the prover has enough balance to cover escrow and try to mint otherwise if on a dev environment
  await token.ensureBalance(targetStake * 2n);

  return new BondManager(token, escrow, minimumStake, targetStake);
}
