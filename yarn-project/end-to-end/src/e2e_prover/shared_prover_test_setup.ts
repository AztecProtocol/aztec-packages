import { type AztecAddress, EthAddress } from '@aztec/aztec.js';
import { type ExtendedViemWalletClient, RollupContract } from '@aztec/ethereum';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { FeeJuicePortalAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import { type GetContractReturnType, getContract } from 'viem';

import { FullProverTest } from '../fixtures/e2e_prover_test.js';

export const TIMEOUT = 1_200_000;
export const REAL_PROOFS = !parseBooleanEnv(process.env.FAKE_PROOFS);

export interface ProverTestContext {
  t: FullProverTest;
  provenAssets: any[];
  accounts: any[];
  tokenSim: any;
  logger: any;
  cheatCodes: any;
  sender: AztecAddress;
  recipient: AztecAddress;
  rollup: RollupContract;
  feeJuiceToken: GetContractReturnType<typeof TestERC20Abi, ExtendedViemWalletClient>;
  feeJuicePortal: GetContractReturnType<typeof FeeJuicePortalAbi, ExtendedViemWalletClient>;
  coinbaseAddress: EthAddress;
}

export async function setupProverTestEnvironment(
  testName: string,
  coinbaseAddress: EthAddress,
): Promise<ProverTestContext> {
  const t = new FullProverTest(testName, 1, coinbaseAddress, REAL_PROOFS);

  t.logger.warn(`Running suite with ${REAL_PROOFS ? 'real' : 'fake'} proofs`);

  await t.applyBaseSnapshots();
  await t.applyMintSnapshot();
  await t.setup();

  const { provenAssets, accounts, tokenSim, logger, cheatCodes } = t;
  const [sender, recipient] = accounts.map((a: any) => a.address);

  const rollup = new RollupContract(t.l1Contracts.l1Client, t.l1Contracts.l1ContractAddresses.rollupAddress);

  const feeJuicePortal = getContract({
    abi: FeeJuicePortalAbi,
    address: t.l1Contracts.l1ContractAddresses.feeJuicePortalAddress.toString(),
    client: t.l1Contracts.l1Client,
  });

  const feeJuiceToken = getContract({
    abi: TestERC20Abi,
    address: t.l1Contracts.l1ContractAddresses.feeJuiceAddress.toString(),
    client: t.l1Contracts.l1Client,
  });

  return {
    t,
    provenAssets,
    accounts,
    tokenSim,
    logger,
    cheatCodes,
    sender,
    recipient,
    rollup,
    feeJuiceToken,
    feeJuicePortal,
    coinbaseAddress,
  };
}
