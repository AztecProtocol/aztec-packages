import { type AztecAddress, EthAddress } from '@aztec/aztec.js';
import type { ExtendedViemWalletClient } from '@aztec/ethereum';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { FeeJuicePortalAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import '@jest/globals';
import { type GetContractReturnType, getContract } from 'viem';

import { FullProverTest } from '../fixtures/e2e_prover_test.js';

// Set a very long 20 minute timeout.
const TIMEOUT = 1_200_000;

describe('client_prover', () => {
  const REAL_PROOFS = !parseBooleanEnv(process.env.FAKE_PROOFS);
  const COINBASE_ADDRESS = EthAddress.random();
  const t = new FullProverTest('full_prover', 1, COINBASE_ADDRESS, REAL_PROOFS);

  let { provenAssets, accounts, logger } = t;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  let feeJuiceToken: GetContractReturnType<typeof TestERC20Abi, ExtendedViemWalletClient>;
  let feeJuicePortal: GetContractReturnType<typeof FeeJuicePortalAbi, ExtendedViemWalletClient>;

  beforeAll(async () => {
    t.logger.warn(`Running suite with ${REAL_PROOFS ? 'real' : 'fake'} proofs`);

    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();

    ({ provenAssets, accounts, logger } = t);
    [sender, recipient] = accounts.map(a => a.address);

    feeJuicePortal = getContract({
      abi: FeeJuicePortalAbi,
      address: t.l1Contracts.l1ContractAddresses.feeJuicePortalAddress.toString(),
      client: t.l1Contracts.l1Client,
    });

    feeJuiceToken = getContract({
      abi: TestERC20Abi,
      address: t.l1Contracts.l1ContractAddresses.feeJuiceAddress.toString(),
      client: t.l1Contracts.l1Client,
    });
  }, 120_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it(
    'proves and verifies the client-side portion of private and public transfers',
    async () => {
      logger.info(`Starting test for client-side portion of public and private transfer`);

      const balance = await feeJuiceToken.read.balanceOf([feeJuicePortal.address]);
      logger.info(`Balance of fee juice token: ${balance}`);

      expect(balance).toBeGreaterThan(0n);

      const canonicalAddress = await feeJuicePortal.read.ROLLUP();
      logger.info(`Canonical address: ${canonicalAddress}`);
      expect(canonicalAddress.toLowerCase()).toBe(
        t.l1Contracts.l1ContractAddresses.rollupAddress.toString().toLowerCase(),
      );

      // Create the two transactions
      const privateBalance = await provenAssets[0].methods.balance_of_private(sender).simulate();
      const privateSendAmount = privateBalance / 10n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAssets[0].methods.transfer(recipient, privateSendAmount);

      const publicBalance = await provenAssets[1].methods.balance_of_public(sender).simulate();
      const publicSendAmount = publicBalance / 10n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = provenAssets[1].methods.transfer_in_public(sender, recipient, publicSendAmount, 0);

      // Prove them
      logger.info(`Proving txs`);
      const [publicProvenTx, privateProvenTx] = await Promise.all([
        publicInteraction.prove(),
        privateInteraction.prove(),
      ]);

      // Verify them
      logger.info(`Verifying txs`);
      await expect(t.circuitProofVerifier?.verifyProof(publicProvenTx)).resolves.not.toThrow();
      await expect(t.circuitProofVerifier?.verifyProof(privateProvenTx)).resolves.not.toThrow();
    },
    TIMEOUT,
  );
});
