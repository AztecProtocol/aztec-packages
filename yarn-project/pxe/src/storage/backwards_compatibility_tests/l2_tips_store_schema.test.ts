import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Tuple } from '@aztec/foundation/serialize';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { PublicDataWrite, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { GasFees } from '@aztec/stdlib/gas';
import { ContractClassLog, ContractClassLogFields, PrivateLog, PublicLog } from '@aztec/stdlib/logs';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  PartialStateReference,
  StateReference,
  TxEffect,
  TxHash,
} from '@aztec/stdlib/tx';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotMap } from './kv_store_snapshot.js';

function paddedFrs(leading: bigint[], totalLength: number): Fr[] {
  const out = leading.map(p => new Fr(p));
  while (out.length < totalLength) {
    out.push(Fr.ZERO);
  }
  return out;
}

function buildPrimedL2Block(): L2Block {
  const archive = new AppendOnlyTreeSnapshot(new Fr(101n), 103);
  const header = new BlockHeader(
    new AppendOnlyTreeSnapshot(new Fr(107n), 109),
    new StateReference(
      new AppendOnlyTreeSnapshot(new Fr(113n), 127),
      new PartialStateReference(
        new AppendOnlyTreeSnapshot(new Fr(131n), 137),
        new AppendOnlyTreeSnapshot(new Fr(139n), 149),
        new AppendOnlyTreeSnapshot(new Fr(151n), 157),
      ),
    ),
    new Fr(163n),
    new GlobalVariables(
      new Fr(167n),
      new Fr(173n),
      BlockNumber(179),
      SlotNumber(181),
      191n,
      EthAddress.fromField(new Fr(193n)),
      AztecAddress.fromBigInt(197n),
      new GasFees(199n, 211n),
    ),
    new Fr(223n),
    new Fr(227n),
  );

  const txEffect = new TxEffect(
    RevertCode.REVERTED,
    TxHash.fromBigInt(229n),
    new Fr(233n),
    [new Fr(239n)],
    [new Fr(241n)],
    [new Fr(251n)],
    [new PublicDataWrite(new Fr(257n), new Fr(263n))],
    [
      new PrivateLog(
        paddedFrs([269n, 271n, 277n], PRIVATE_LOG_SIZE_IN_FIELDS) as Tuple<Fr, typeof PRIVATE_LOG_SIZE_IN_FIELDS>,
        3,
      ),
    ],
    [new PublicLog(AztecAddress.fromBigInt(281n), [new Fr(283n), new Fr(293n)])],
    [
      new ContractClassLog(
        AztecAddress.fromBigInt(307n),
        new ContractClassLogFields(paddedFrs([311n, 313n, 317n], CONTRACT_CLASS_LOG_SIZE_IN_FIELDS)),
        3,
      ),
    ],
  );

  return new L2Block(archive, header, new Body([txEffect]), CheckpointNumber(331), IndexWithinCheckpoint(337));
}

describe('L2TipsKVStore schema compatibility', () => {
  it('persists tips, hashes, block-to-checkpoint mappings, and checkpoints across event types', async () => {
    const kvStore = await openTmpStore('pxe-schema-l2-tips', true);
    try {
      const l2TipsStore = new L2TipsKVStore(kvStore, 'pxe');

      const block = buildPrimedL2Block();
      const checkpoint = new Checkpoint(
        new AppendOnlyTreeSnapshot(new Fr(2n), 3),
        new CheckpointHeader(
          new Fr(5n),
          new Fr(7n),
          new Fr(11n),
          new Fr(13n),
          new Fr(17n),
          SlotNumber(19),
          23n,
          EthAddress.fromField(new Fr(29n)),
          AztecAddress.fromBigInt(31n),
          new GasFees(37n, 41n),
          new Fr(43n),
        ),
        [block],
        CheckpointNumber(47),
        53n,
      );
      const publishedCheckpoint = new PublishedCheckpoint(
        checkpoint,
        new L1PublishedData(59n, 61n, new Fr(67n).toString()),
        [],
      );

      // `'blocks-added'` writes to `pxe_l2_tips` (proposed tag) and `pxe_l2_block_hashes`.
      // `'chain-checkpointed'` writes to all four sub-stores: tips ('checkpointed' and 'proposedCheckpoint'
      // tags, block-to-checkpoint mapping, and the checkpoint store).
      await l2TipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        block: { number: BlockNumber(71), hash: new Fr(73n).toString() },
        checkpoint: publishedCheckpoint,
      });
      // `'chain-proven'` writes the 'proven' tag. `'finalized'` is omitted because its handler runs delete-before
      // logic that would depend on the order of preceding events.
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(79), hash: new Fr(83n).toString() },
      });

      const tips = kvStore.openMap<string, number>('pxe_l2_tips');
      const blockHashes = kvStore.openMap<number, string>('pxe_l2_block_hashes');
      const blockToCheckpoint = kvStore.openMap<number, number>('pxe_l2_block_number_to_checkpoint_number');
      const checkpoints = kvStore.openMap<number, Buffer>('pxe_l2_checkpoint_store');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        pxe_l2_tips: await snapshotMap(tips),
        pxe_l2_block_hashes: await snapshotMap(blockHashes),
        pxe_l2_block_number_to_checkpoint_number: await snapshotMap(blockToCheckpoint),
        pxe_l2_checkpoint_store: await snapshotMap(checkpoints),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
