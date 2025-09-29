import { AztecAddress, EthAddress, Fr, type Logger, type Wallet } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import {
  type DeployL1ContractsReturnType,
  GovernanceProposerContract,
  RollupContract,
  deployL1Contract,
} from '@aztec/ethereum';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { bufferToHex } from '@aztec/foundation/string';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';

const ETHEREUM_SLOT_DURATION = 8;
const AZTEC_SLOT_DURATION = 16;
const TXS_PER_BLOCK = 1;
const ROUND_SIZE = 2;
const QUORUM_SIZE = 2;
// Can't use 48 without chunking the addValidators call.
const COMMITTEE_SIZE = 16;

describe('e2e_gov_proposal', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let deployL1ContractsValues: DeployL1ContractsReturnType;
  let cheatCodes: CheatCodes;

  beforeEach(async () => {
    const validatorOffset = 10;
    const validators = times(COMMITTEE_SIZE, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + validatorOffset)!);
      const account = privateKeyToAccount(privateKey);
      const address = EthAddress.fromString(account.address);
      return { attester: address, withdrawer: address, privateKey };
    });
    let accounts: AztecAddress[] = [];
    ({ teardown, logger, wallet, aztecNodeAdmin, deployL1ContractsValues, cheatCodes, accounts } = await setup(1, {
      anvilAccounts: 100,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      initialValidators: validators.map(v => ({ ...v, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) })),
      validatorPrivateKeys: new SecretValue(validators.map(v => v.privateKey)), // sequencer runs with all validator keys
      governanceProposerRoundSize: ROUND_SIZE,
      governanceProposerQuorum: QUORUM_SIZE,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      aztecProofSubmissionEpochs: 128, // no pruning
      salt: 420,
      minTxsPerBlock: TXS_PER_BLOCK,
      enforceTimeTable: true,
      automineL1Setup: true, // speed up setup
    }));
    defaultAccountAddress = accounts[0];
  }, 3 * 60000);

  afterEach(() => teardown());

  it(
    'should build/propose blocks while voting',
    async () => {
      const { l1Client, l1ContractAddresses } = deployL1ContractsValues;
      const { registryAddress, rollupAddress, gseAddress, governanceProposerAddress } = l1ContractAddresses;
      const rollup = new RollupContract(l1Client, rollupAddress.toString());
      const governanceProposer = new GovernanceProposerContract(l1Client, governanceProposerAddress.toString());

      const { address: newGovernanceProposerAddress } = await deployL1Contract(
        l1Client,
        NewGovernanceProposerPayloadAbi,
        NewGovernanceProposerPayloadBytecode,
        [registryAddress.toString(), gseAddress!.toString()],
        { salt: '0x2a' },
      );

      // Deploy a test contract to send msgs via the outbox, since this increases
      // gas cost of a proposal, which has triggered oog errors in the past.
      const testContract = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }).deployed();

      await aztecNodeAdmin!.setConfig({
        governanceProposerPayload: newGovernanceProposerAddress,
        maxTxsPerBlock: TXS_PER_BLOCK,
      });

      const roundDuration = await governanceProposer.getRoundSize();
      expect(roundDuration).toEqual(BigInt(ROUND_SIZE));
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.computeRound(slot);
      const nextRoundBeginsAtSlot = (slot / roundDuration) * roundDuration + roundDuration;
      const nextRoundBeginsAtTimestamp = await rollup.getTimestampForSlot(nextRoundBeginsAtSlot);

      logger.warn(`Warping to round ${round + 1n} at slot ${nextRoundBeginsAtSlot}`, {
        nextRoundBeginsAtSlot,
        nextRoundBeginsAtTimestamp,
        roundDuration,
        slot,
        round,
      });

      await cheatCodes.eth.warp(Number(nextRoundBeginsAtTimestamp), {
        resetBlockInterval: true,
      });

      // Now we submit a bunch of transactions to the PXE.
      // We know that this will last at least as long as the round duration,
      // since we wait for the txs to be mined, and do so `roundDuration` times.
      // Simultaneously, we should be voting for the proposal in every slot.

      for (let i = 0; i < roundDuration; i++) {
        const txs = times(TXS_PER_BLOCK, () =>
          testContract.methods
            .create_l2_to_l1_message_arbitrary_recipient_private(Fr.random(), EthAddress.random())
            .send({ from: defaultAccountAddress }),
        );
        await Promise.all(
          txs.map(async (tx, j) => {
            logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
            return tx.wait({ timeout: 2 * AZTEC_SLOT_DURATION + 2 });
          }),
        );
      }

      logger.warn('All transactions submitted and mined');
      const signals = await governanceProposer.getPayloadSignals(
        rollupAddress.toString(),
        round + 1n,
        newGovernanceProposerAddress.toString(),
      );
      expect(signals).toBeGreaterThan(0n);
    },
    1000 * 60 * 5,
  );
});
