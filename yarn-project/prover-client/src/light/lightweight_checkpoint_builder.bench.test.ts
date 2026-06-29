import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { EthAddress } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import { ContractClassLog, ContractClassLogFields } from '@aztec/stdlib/logs';
import { mockProcessedTx } from '@aztec/stdlib/testing';
import { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { CheckpointGlobalVariables, ProcessedTx } from '@aztec/stdlib/tx';
import { GlobalVariables } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { afterAll, afterEach, beforeEach, describe, it, jest } from '@jest/globals';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LightweightCheckpointBuilder } from './lightweight_checkpoint_builder.js';

jest.setTimeout(300_000);

const logger = createLogger('bench:lightweight-checkpoint-builder');

describe('LightweightCheckpointBuilder benchmarks', () => {
  let worldState: NativeWorldStateService;
  let feePayer: AztecAddress;
  let feePayerBalance: Fr;

  const results: { name: string; value: number; unit: string }[] = [];

  const toPrettyString = () =>
    results.map(({ name, value, unit }) => `${name}: ${value.toFixed(2)} ${unit}`).join('\n');

  const toGithubActionBenchmarkJSON = (indent = 2) => JSON.stringify(results, null, indent);

  beforeEach(async () => {
    feePayer = AztecAddress.fromNumberUnsafe(42222);
    feePayerBalance = new Fr(10n ** 20n);
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const genesis: GenesisData = {
      prefilledPublicData: [new PublicDataTreeLeaf(feePayerSlot, feePayerBalance)],
      genesisTimestamp: 0n,
    };
    worldState = await NativeWorldStateService.tmp(undefined, true, genesis);
  });

  afterEach(async () => {
    await worldState.close();
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, toGithubActionBenchmarkJSON());
    } else {
      logger.info(`\n${toPrettyString()}\n`);
    }
  });

  const makeCheckpointConstants = (slotNumber: SlotNumber): CheckpointGlobalVariables => ({
    chainId: Fr.ZERO,
    version: Fr.ZERO,
    slotNumber,
    timestamp: BigInt(slotNumber) * 123n,
    coinbase: EthAddress.ZERO,
    feeRecipient: AztecAddress.ZERO,
    gasFees: GasFees.empty(),
  });

  const makeGlobalVariables = (blockNumber: BlockNumber, slotNumber: SlotNumber): GlobalVariables =>
    GlobalVariables.from({
      chainId: Fr.ZERO,
      version: Fr.ZERO,
      blockNumber,
      slotNumber,
      timestamp: BigInt(blockNumber) * 123n,
      coinbase: EthAddress.ZERO,
      feeRecipient: AztecAddress.ZERO,
      gasFees: GasFees.empty(),
    });

  const makeProcessedTx = async (globalVariables: GlobalVariables, seed: number): Promise<ProcessedTx> => {
    const tx = await mockProcessedTx({
      seed,
      globalVariables,
      vkTreeRoot: getVKTreeRoot(),
      protocolContracts: ProtocolContractsList,
      feePayer,
    });

    feePayerBalance = new Fr(feePayerBalance.toBigInt() - tx.txEffect.transactionFee.toBigInt());
    const feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const feePaymentPublicDataWrite = new PublicDataWrite(feePayerSlot, feePayerBalance);
    tx.txEffect.publicDataWrites[0] = feePaymentPublicDataWrite;
    if (tx.avmProvingRequest) {
      tx.avmProvingRequest.inputs.publicInputs.accumulatedData.publicDataWrites[0] = feePaymentPublicDataWrite;
    }

    return tx;
  };

  /** Creates a tx with no side effects but a full contract class log. */
  const makeLogsHeavyProcessedTx = async (globalVariables: GlobalVariables, seed: number): Promise<ProcessedTx> => {
    const tx = await makeProcessedTx(globalVariables, seed);

    // Strip side effects: keep only the tx hash nullifier and fee payment public data write.
    tx.txEffect.noteHashes = [];
    tx.txEffect.nullifiers = [tx.txEffect.nullifiers[0]];
    tx.txEffect.l2ToL1Msgs = [];
    tx.txEffect.privateLogs = [];
    tx.txEffect.publicDataWrites = [tx.txEffect.publicDataWrites[0]];

    // Add a full contract class log (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS = 3,023 blob fields).
    tx.txEffect.contractClassLogs = [
      new ContractClassLog(
        AztecAddress.fromNumberUnsafe(seed),
        ContractClassLogFields.random(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS),
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
      ),
    ];

    return tx;
  };

  type TxFactory = (globalVariables: GlobalVariables, seed: number) => Promise<ProcessedTx>;

  const testCases: { label: string; numTxs: number; makeTx: TxFactory }[] = [
    { label: 'worst-case', numTxs: 4, makeTx: makeProcessedTx },
    { label: 'worst-case', numTxs: 8, makeTx: makeProcessedTx },
    { label: 'worst-case', numTxs: 16, makeTx: makeProcessedTx },
    { label: 'class-log-heavy', numTxs: 4, makeTx: makeLogsHeavyProcessedTx },
    { label: 'class-log-heavy', numTxs: 8, makeTx: makeLogsHeavyProcessedTx },
  ];

  describe('addBlock breakdown', () => {
    it.each(testCases)('$label $numTxs txs', async ({ label, numTxs, makeTx }) => {
      const slotNumber = SlotNumber(15);
      const blockNumber = BlockNumber(1);
      const constants = makeCheckpointConstants(slotNumber);
      const fork = await worldState.fork();

      const builder = await LightweightCheckpointBuilder.startNewCheckpoint(
        CheckpointNumber(1),
        constants,
        [],
        [],
        fork,
      );

      const globalVariables = makeGlobalVariables(blockNumber, slotNumber);
      const txs = await timesAsync(numTxs, i => makeTx(globalVariables, 5000 + i));

      const { timings } = await builder.addBlock(globalVariables, txs, { insertTxsEffects: true });

      const prefix = `addBlock/${label}/${numTxs} txs`;
      for (const [step, ms] of Object.entries(timings)) {
        results.push({ name: `${prefix}/${step}`, value: ms, unit: 'ms' });
      }
      const total = Object.values(timings).reduce((a, b) => a + b, 0);
      results.push({ name: `${prefix}/total`, value: total, unit: 'ms' });

      await fork.close();
    });
  });
});
