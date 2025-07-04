import { EthAddress, type Logger, type PXE, type Wallet } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import {
  type DeployL1ContractsReturnType,
  GovernanceProposerContract,
  RollupContract,
  deployL1Contract,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';
import type { PXEService } from '@aztec/pxe/server';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';
import { submitTxsTo } from '../shared/submit-transactions.js';

describe('e2e_gov_proposal', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let pxe: PXE;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let deployL1ContractsValues: DeployL1ContractsReturnType;
  let aztecSlotDuration: number;
  let cheatCodes: CheatCodes;
  beforeEach(async () => {
    const privateKey = `0x${getPrivateKeyFromIndex(0)!.toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const initialValidators = [
      {
        attester: EthAddress.fromString(account.address),
        withdrawer: EthAddress.fromString(account.address),
        privateKey,
      },
    ];
    const { ethereumSlotDuration, aztecSlotDuration: _aztecSlotDuration } = getL1ContractsConfigEnvVars();
    aztecSlotDuration = _aztecSlotDuration;

    ({ teardown, logger, wallet, pxe, aztecNodeAdmin, deployL1ContractsValues, cheatCodes } = await setup(1, {
      initialValidators,
      ethereumSlotDuration,
      salt: 420,
      minTxsPerBlock: 8,
      enforceTimeTable: true,
    }));
  }, 3 * 60000);

  afterEach(() => teardown());

  it(
    'should build/propose blocks while voting',
    async () => {
      const { address: newGovernanceProposerAddress } = await deployL1Contract(
        deployL1ContractsValues.l1Client,
        NewGovernanceProposerPayloadAbi,
        NewGovernanceProposerPayloadBytecode,
        [deployL1ContractsValues.l1ContractAddresses.registryAddress.toString()],
        '0x2a', // salt
      );
      await aztecNodeAdmin!.setConfig({
        governanceProposerPayload: newGovernanceProposerAddress,
      });
      const rollup = new RollupContract(
        deployL1ContractsValues.l1Client,
        deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      );
      const governanceProposer = new GovernanceProposerContract(
        deployL1ContractsValues.l1Client,
        deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString(),
      );

      const roundDuration = await governanceProposer.getRoundSize();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.computeRound(slot);
      const nextRoundBeginsAtSlot = (slot / roundDuration) * roundDuration + roundDuration;
      const nextRoundBeginsAtTimestamp = await rollup.getTimestampForSlot(nextRoundBeginsAtSlot);
      logger.info(`Warping to round ${round + 1n} at slot ${nextRoundBeginsAtSlot}`);
      await cheatCodes.eth.warp(Number(nextRoundBeginsAtTimestamp), { resetBlockInterval: true });

      // Now we submit a bunch of transactions to the PXE.
      // We know that this will last at least as long as the round duration,
      // since we wait for the txs to be mined, and do so `roundDuration` times.
      // Simultaneously, we should be voting for the proposal in every slot.

      for (let i = 0; i < roundDuration; i++) {
        const txs = await submitTxsTo(pxe as PXEService, 8, wallet, logger);
        await Promise.all(
          txs.map(async (tx, j) => {
            logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
            return tx.wait({ timeout: 2 * aztecSlotDuration + 2 });
          }),
        );
      }

      const votes = await governanceProposer.getProposalVotes(
        deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round + 1n,
        newGovernanceProposerAddress.toString(),
      );
      expect(votes).toEqual(roundDuration);
    },
    1000 * 60 * 5,
  );
});
