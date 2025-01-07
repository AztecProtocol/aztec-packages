import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AztecNode, type CheatCodes, Fr, GrumpkinScalar, type Logger, type PXE, TxStatus } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/circuits.js';
import {
  type DeployL1Contracts,
  GovernanceProposerContract,
  RollupContract,
  deployL1Contract,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';
import { type PXEService } from '@aztec/pxe';

import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';

describe('e2e_l1_with_wall_time', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let pxe: PXE;
  let aztecNode: AztecNode;
  let deployL1ContractsValues: DeployL1Contracts;
  let aztecSlotDuration: number;
  let cheatCodes: CheatCodes;
  beforeEach(async () => {
    const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`);
    const initialValidators = [EthAddress.fromString(account.address)];
    const { ethereumSlotDuration } = getL1ContractsConfigEnvVars();

    ({ teardown, logger, pxe, aztecNode, deployL1ContractsValues, cheatCodes } = await setup(0, {
      initialValidators,
      ethereumSlotDuration,
      salt: 420,
    }));
  }, 3 * 60000);

  afterEach(() => teardown());

  it(
    'should produce blocks with a bunch of transactions',
    async () => {
      const { address: newGovernanceProposerAddress } = await deployL1Contract(
        deployL1ContractsValues.walletClient,
        deployL1ContractsValues.publicClient,
        NewGovernanceProposerPayloadAbi,
        NewGovernanceProposerPayloadBytecode,
        [deployL1ContractsValues.l1ContractAddresses.registryAddress.toString()],
        '0x2a', // salt
      );
      await aztecNode.setConfig({
        governanceProposerPayload: newGovernanceProposerAddress,
      });
      const rollup = new RollupContract(
        deployL1ContractsValues.publicClient,
        deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      );
      const governanceProposer = new GovernanceProposerContract(
        deployL1ContractsValues.publicClient,
        deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString(),
      );

      const roundDuration = await governanceProposer.getRoundDuration();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.computeRound(slot);
      const nextRoundBeginsAtSlot = (slot / roundDuration) * roundDuration + roundDuration;
      const nextRoundBeginsAtTimestamp = await rollup.getTimestampForSlot(nextRoundBeginsAtSlot);
      logger.info(`Warping to round ${round + 1n} at slot ${nextRoundBeginsAtSlot}`);
      await cheatCodes.eth.warp(Number(nextRoundBeginsAtTimestamp));

      for (let i = 0; i < roundDuration; i++) {
        const txs = await submitTxsTo(pxe as PXEService, 8);
        await Promise.all(
          txs.map(async (tx, j) => {
            logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
            return tx.wait({ timeout: aztecSlotDuration + 2 });
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
    5 * 60000,
  );

  // submits a set of transactions to the provided Private eXecution Environment (PXE)
  const submitTxsTo = async (pxe: PXEService, numTxs: number) => {
    const provenTxs = [];
    for (let i = 0; i < numTxs; i++) {
      const accountManager = getSchnorrAccount(pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
      const deployMethod = await accountManager.getDeployMethod();
      const tx = await deployMethod.prove({
        contractAddressSalt: accountManager.salt,
        skipClassRegistration: true,
        skipPublicDeployment: true,
        universalDeploy: true,
      });
      provenTxs.push(tx);
    }
    const sentTxs = await Promise.all(
      provenTxs.map(async provenTx => {
        const tx = provenTx.send();
        const txHash = await tx.getTxHash();

        logger.info(`Tx sent with hash ${txHash}`);
        const receipt = await tx.getReceipt();
        expect(receipt).toEqual(
          expect.objectContaining({
            status: TxStatus.PENDING,
            error: '',
          }),
        );
        logger.info(`Receipt received for ${txHash}`);
        return tx;
      }),
    );
    return sentTxs;
  };
});
