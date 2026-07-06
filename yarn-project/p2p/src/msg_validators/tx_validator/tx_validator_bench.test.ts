import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_NULLIFIERS_PER_TX, NULLIFIER_SUBTREE_HEIGHT } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd, times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { LogHash } from '@aztec/stdlib/kernel';
import { ContractClassLogFields } from '@aztec/stdlib/logs';
import { makeSelector, mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import { DatabasePublicStateSource, MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { Tx } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/world-state';
import { NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { type MockProxy, mock, mockFn } from 'jest-mock-extended';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

import { ArchiveCache } from './archive_cache.js';
import { BlockHeaderTxValidator } from './block_header_validator.js';
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator, type NullifierSource } from './double_spend_validator.js';
import { GasTxValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
import { PhasesTxValidator } from './phases_validator.js';
import { SizeTxValidator } from './size_validator.js';
import { patchNonRevertibleFn } from './test_utils.js';
import { TimestampTxValidator } from './timestamp_validator.js';
import { TxPermittedValidator } from './tx_permitted_validator.js';

jest.setTimeout(300_000);

const RUNS = 50;

type BenchEntry = {
  name: string;
  histogram: RecordableHistogram;
  unit: 'ms' | 'us';
};

describe('TxValidator: Benchmarks', () => {
  const entries: BenchEntry[] = [];

  // Pre-built txs and validators
  let privateTx: Tx;
  let publicTx: Tx;
  let ccLogTx: Tx;
  let metadataTx: Tx;
  let timestampTx: Tx;
  let permittedTx: Tx;
  let sizeTx: Tx;
  let doubleSpendTx: Tx;
  let gasTx: Tx;
  let phasesPrivateTx: Tx;
  let phasesPublicTx: Tx;
  let blockHeaderTx: Tx;

  let dataValidator: DataTxValidator;
  let metadataValidator: MetadataTxValidator<Tx>;
  let timestampValidator: TimestampTxValidator<Tx>;
  let permittedValidator: TxPermittedValidator;
  let sizeValidator: SizeTxValidator;
  let doubleSpendValidator: DoubleSpendTxValidator<Tx>;
  let gasValidator: GasTxValidator;
  let phasesValidator: PhasesTxValidator;
  let blockHeaderValidator: BlockHeaderTxValidator<Tx>;
  let worldStateService: NativeWorldStateService;

  // Deterministic CC log fields for the poseidon2 microbenchmark
  let ccLogFields: ContractClassLogFields;

  function makeEntry(name: string, unit: 'ms' | 'us'): BenchEntry {
    const entry: BenchEntry = { name, histogram: createHistogram(), unit };
    entries.push(entry);
    return entry;
  }

  beforeAll(async () => {
    // --- Build all mock txs ---

    // DataTxValidator: private tx (no public calls, no CC logs)
    privateTx = await mockTxForRollup(1);

    // DataTxValidator: public tx
    publicTx = await mockTx(2, {
      numberOfNonRevertiblePublicCallRequests: 2,
      numberOfRevertiblePublicCallRequests: 2,
      hasPublicTeardownCallRequest: true,
    });

    // DataTxValidator: tx with CC log
    ccLogTx = await mockTx(3, {
      numberOfNonRevertiblePublicCallRequests: 2,
      numberOfRevertiblePublicCallRequests: 2,
      hasPublicTeardownCallRequest: true,
    });
    ccLogFields = ContractClassLogFields.random();
    const logHash = await ccLogFields.hash();
    const scopedLogHash = LogHash.from({ value: logHash, length: CONTRACT_CLASS_LOG_SIZE_IN_FIELDS }).scope(
      AztecAddress.fromNumber(1),
    );
    ccLogTx.contractClassLogFields.push(ccLogFields);
    ccLogTx.data.forPublic!.nonRevertibleAccumulatedData.contractClassLogsHashes[0] = scopedLogHash;
    await ccLogTx.recomputeHash();

    // MetadataTxValidator
    const chainId = new Fr(1);
    const rollupVersion = new Fr(1);
    const vkTreeRoot = new Fr(100);
    const protocolContractsHash = new Fr(200);
    metadataTx = await mockTx(4, { chainId, version: rollupVersion, vkTreeRoot, protocolContractsHash });
    metadataValidator = new MetadataTxValidator({
      l1ChainId: chainId,
      rollupVersion,
      vkTreeRoot,
      protocolContractsHash,
    });

    // TimestampTxValidator
    timestampTx = await mockTx(5);
    timestampTx.data.expirationTimestamp = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
    timestampValidator = new TimestampTxValidator({
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      blockNumber: BlockNumber(3),
    });

    // TxPermittedValidator
    permittedTx = await mockTx(6);
    permittedValidator = new TxPermittedValidator(true);

    // SizeTxValidator
    sizeTx = await mockTx(7);
    sizeValidator = new SizeTxValidator();

    // DoubleSpendTxValidator
    doubleSpendTx = await mockTx(8);
    gasTx = await mockTx(9);

    // Create real LMDB-backed world state with fee payer balance
    const feePayerLeafSlot = await computeFeePayerBalanceLeafSlot(gasTx.data.feePayer);
    const genesis: GenesisData = {
      prefilledPublicData: [new PublicDataTreeLeaf(feePayerLeafSlot, new Fr(10n ** 18n))],
      genesisTimestamp: 0n,
    };
    worldStateService = await NativeWorldStateService.tmp(true, genesis);
    const merkleTree = worldStateService.getCommitted();

    const nullifierSource: NullifierSource = {
      nullifiersExist: async (nullifiers: Buffer[]) => {
        const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
        return indices.map(index => index !== undefined);
      },
    };
    doubleSpendValidator = new DoubleSpendTxValidator(nullifierSource);

    // GasTxValidator
    gasValidator = new GasTxValidator(
      new DatabasePublicStateSource(merkleTree),
      ProtocolContractAddress.FeeJuice,
      new GasFees(10, 10),
    );

    // PhasesTxValidator - private tx (early return)
    phasesPrivateTx = await mockTxForRollup(10);

    // PhasesTxValidator - public tx with allowed setup
    const allowedAddress = AztecAddress.fromNumber(999);
    const allowedSelector = makeSelector(1);
    phasesPublicTx = await mockTx(11, { numberOfNonRevertiblePublicCallRequests: 1 });
    await patchNonRevertibleFn(phasesPublicTx, 0, { address: allowedAddress, selector: allowedSelector });
    await phasesPublicTx.recomputeHash();

    const contractDataSource: MockProxy<ContractDataSource> = mock<ContractDataSource>({
      getContract: mockFn().mockResolvedValue({
        currentContractClassId: Fr.random(),
        originalContractClassId: Fr.random(),
      }),
    });
    phasesValidator = new PhasesTxValidator(
      contractDataSource,
      [{ address: allowedAddress, selector: allowedSelector }],
      BigInt(Math.floor(Date.now() / 1000)),
    );

    // BlockHeaderTxValidator
    blockHeaderTx = await mockTx(12);
    blockHeaderTx.data.constants.anchorBlockHeader = worldStateService.getInitialHeader();
    await blockHeaderTx.recomputeHash();
    blockHeaderValidator = new BlockHeaderTxValidator(new ArchiveCache(merkleTree));

    // DataTxValidator (stateless, single instance)
    dataValidator = new DataTxValidator();

    // --- Warmup: run each validator once to warm WASM/JIT ---
    await ccLogFields.hash();
    await dataValidator.validateTx(privateTx);
    await dataValidator.validateTx(publicTx);
    await dataValidator.validateTx(ccLogTx);
    await metadataValidator.validateTx(metadataTx);
    await timestampValidator.validateTx(timestampTx);
    await permittedValidator.validateTx(permittedTx);
    await sizeValidator.validateTx(sizeTx);
    await doubleSpendValidator.validateTx(doubleSpendTx);
    await gasValidator.validateTx(gasTx);
    await phasesValidator.validateTx(phasesPrivateTx);
    await phasesValidator.validateTx(phasesPublicTx);
    await blockHeaderValidator.validateTx(blockHeaderTx);
  });

  afterAll(async () => {
    await worldStateService.close();

    if (process.env.BENCH_OUTPUT) {
      const data: any[] = [];
      for (const { name, histogram, unit } of entries) {
        data.push({ name: `TxValidator/${name}/avg`, value: histogram.mean, unit });
        data.push({ name: `TxValidator/${name}/p50`, value: histogram.percentile(50), unit });
        data.push({ name: `TxValidator/${name}/p95`, value: histogram.percentile(95), unit });
      }

      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await fs.writeFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
    } else if (process.env.BENCH_OUTPUT_MD) {
      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT_MD), { recursive: true });
      await using f = await fs.open(process.env.BENCH_OUTPUT_MD!, 'w');
      await f.write('|Validator|UNIT|MIN|AVG|P50|P95|MAX|\n');
      await f.write('|---------|----|---|---|---|---|---|\n');
      for (const { name, histogram, unit } of entries) {
        await f.write(
          `|${name}|${unit}|${histogram.min}|${histogram.mean}|${histogram.percentile(50)}|${histogram.percentile(95)}|${histogram.max}|\n`,
        );
      }
    }
  });

  it('poseidon2Hash of CONTRACT_CLASS_LOG_SIZE_IN_FIELDS fields', async () => {
    const entry = makeEntry('poseidon2Hash-3023-fields', 'ms');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await ccLogFields.hash();
      entry.histogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('DataTxValidator - private tx', async () => {
    const entry = makeEntry('DataTxValidator-private/validateTx', 'ms');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await dataValidator.validateTx(privateTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('DataTxValidator - public tx', async () => {
    const entry = makeEntry('DataTxValidator-public/validateTx', 'ms');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await dataValidator.validateTx(publicTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('DataTxValidator - tx with contract class log', async () => {
    const entry = makeEntry('DataTxValidator-cc-log/validateTx', 'ms');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await dataValidator.validateTx(ccLogTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('MetadataTxValidator', async () => {
    const entry = makeEntry('MetadataTxValidator/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await metadataValidator.validateTx(metadataTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  it('TimestampTxValidator', async () => {
    const entry = makeEntry('TimestampTxValidator/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await timestampValidator.validateTx(timestampTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  it('TxPermittedValidator', async () => {
    const entry = makeEntry('TxPermittedValidator/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await permittedValidator.validateTx(permittedTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  it('SizeTxValidator', async () => {
    const entry = makeEntry('SizeTxValidator/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await sizeValidator.validateTx(sizeTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  it('DoubleSpendTxValidator', async () => {
    const entry = makeEntry('DoubleSpendTxValidator/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await doubleSpendValidator.validateTx(doubleSpendTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  it('GasTxValidator', async () => {
    const entry = makeEntry('GasTxValidator/validateTx', 'ms');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await gasValidator.validateTx(gasTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('PhasesTxValidator - private tx (early return)', async () => {
    const entry = makeEntry('PhasesTxValidator-private/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await phasesValidator.validateTx(phasesPrivateTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  it('PhasesTxValidator - public tx with allowed setup', async () => {
    const entry = makeEntry('PhasesTxValidator-public/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await phasesValidator.validateTx(phasesPublicTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  it('BlockHeaderTxValidator', async () => {
    const entry = makeEntry('BlockHeaderTxValidator/validateTx', 'us');
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await blockHeaderValidator.validateTx(blockHeaderTx);
      entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
    }
  });

  describe.each([100, 1_000, 10_000, 100_000])('DB fill rate: %d items', (dbSize: number) => {
    let localWs: NativeWorldStateService;
    let localFork: MerkleTreeWriteOperations;
    let localBlockHeaderTx: Tx;

    beforeAll(async () => {
      const primeTimer = new Timer();

      // Create world state with fee payer balance only (initial tree size limits prefilled data)
      const feePayerLeafSlot = await computeFeePayerBalanceLeafSlot(gasTx.data.feePayer);
      localWs = await NativeWorldStateService.tmp(true, {
        prefilledPublicData: [new PublicDataTreeLeaf(feePayerLeafSlot, new Fr(10n ** 18n))],
        genesisTimestamp: 0n,
      });
      localFork = await localWs.fork();

      // Fill public data tree via fork
      const publicDataLeaves = times(dbSize, i =>
        new PublicDataTreeLeaf(new Fr(BigInt(1000 + i)), new Fr(BigInt(i + 1))).toBuffer(),
      );
      for (let start = 0; start < publicDataLeaves.length; start += MAX_NULLIFIERS_PER_TX) {
        await localFork.batchInsert(
          MerkleTreeId.PUBLIC_DATA_TREE,
          publicDataLeaves.slice(start, start + MAX_NULLIFIERS_PER_TX),
          0,
        );
      }

      // Fill nullifier tree in batches of MAX_NULLIFIERS_PER_TX, padded with Fr.ZERO
      const nullifiers = times(dbSize, i => new Fr(BigInt(100000 + i)));
      for (let start = 0; start < nullifiers.length; start += MAX_NULLIFIERS_PER_TX) {
        const batch = nullifiers.slice(start, start + MAX_NULLIFIERS_PER_TX);
        const padded = padArrayEnd(batch, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer());
        await localFork.batchInsert(MerkleTreeId.NULLIFIER_TREE, padded, NULLIFIER_SUBTREE_HEIGHT);
      }

      // Fill archive tree
      await localFork.appendLeaves(
        MerkleTreeId.ARCHIVE,
        times(dbSize, i => new BlockHash(new Fr(BigInt(200000 + i)))),
      );

      // Record priming time
      makeEntry(`DB-fill-${dbSize}/prime`, 'ms').histogram.record(Math.max(1, Math.ceil(primeTimer.ms())));

      // BlockHeaderTx needs anchorBlockHeader matching the inner world state's initial header
      localBlockHeaderTx = await mockTx(1000 + dbSize);
      localBlockHeaderTx.data.constants.anchorBlockHeader = localWs.getInitialHeader();
      await localBlockHeaderTx.recomputeHash();
    });

    afterAll(async () => {
      await localFork?.close();
      await localWs?.close();
    });

    it('DoubleSpendTxValidator', async () => {
      const entry = makeEntry(`DoubleSpendTxValidator-db${dbSize}/validateTx`, 'us');
      const validator = new DoubleSpendTxValidator({
        nullifiersExist: async (ns: Buffer[]) => {
          const indices = await localFork.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, ns);
          return indices.map(index => index !== undefined);
        },
      });
      for (let i = 0; i < RUNS; i++) {
        const timer = new Timer();
        await validator.validateTx(doubleSpendTx);
        entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
      }
    });

    it('GasTxValidator', async () => {
      const entry = makeEntry(`GasTxValidator-db${dbSize}/validateTx`, 'ms');
      const validator = new GasTxValidator(
        new DatabasePublicStateSource(localFork),
        ProtocolContractAddress.FeeJuice,
        new GasFees(10, 10),
      );
      for (let i = 0; i < RUNS; i++) {
        const timer = new Timer();
        await validator.validateTx(gasTx);
        entry.histogram.record(Math.max(1, Math.ceil(timer.ms())));
      }
    });

    it('BlockHeaderTxValidator', async () => {
      const entry = makeEntry(`BlockHeaderTxValidator-db${dbSize}/validateTx`, 'us');
      const validator = new BlockHeaderTxValidator(new ArchiveCache(localFork));
      for (let i = 0; i < RUNS; i++) {
        const timer = new Timer();
        await validator.validateTx(localBlockHeaderTx);
        entry.histogram.record(Math.max(1, Math.ceil(timer.us())));
      }
    });
  });
});
