import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, PartialStateReference, StateReference } from '@aztec/stdlib/tx';

import { AnchorBlockStore } from '../anchor_block_store/anchor_block_store.js';
import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { snapshotSingleton } from './kv_store_snapshot.js';

describe('AnchorBlockStore schema compatibility', () => {
  it('persists the synchronized block header', async () => {
    const kvStore = await openTmpStore('pxe-schema-anchor-block', true);
    try {
      const anchorBlockStore = new AnchorBlockStore(kvStore);

      // Each primitive field gets a distinct prime so any reorder shows up in the snapshot diff.
      // An all-zero `BlockHeader.empty()` would silently pass through same-width field swaps.
      const header = new BlockHeader(
        new AppendOnlyTreeSnapshot(new Fr(2n), 3),
        new StateReference(
          new AppendOnlyTreeSnapshot(new Fr(5n), 7),
          new PartialStateReference(
            new AppendOnlyTreeSnapshot(new Fr(11n), 13),
            new AppendOnlyTreeSnapshot(new Fr(17n), 19),
            new AppendOnlyTreeSnapshot(new Fr(23n), 29),
          ),
        ),
        new Fr(31n),
        new GlobalVariables(
          new Fr(37n),
          new Fr(41n),
          BlockNumber(43),
          SlotNumber(47),
          53n,
          EthAddress.fromField(new Fr(59n)),
          AztecAddress.fromBigInt(61n),
          new GasFees(67n, 71n),
        ),
        new Fr(73n),
        new Fr(79n),
      );
      await anchorBlockStore.setHeader(header);

      const headerSingleton = kvStore.openSingleton<Buffer>('header');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        header: await snapshotSingleton(headerSingleton),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
