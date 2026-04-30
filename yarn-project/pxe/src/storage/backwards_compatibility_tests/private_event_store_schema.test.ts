import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { PrivateEventStore } from '../private_event_store/private_event_store.js';
import { snapshotMap, snapshotMultiMap } from './kv_store_snapshot.js';

describe('PrivateEventStore schema compatibility', () => {
  it('persists private event logs after commit', async () => {
    const kvStore = await openTmpStore('pxe-schema-private-event', true);
    try {
      const privateEventStore = new PrivateEventStore(kvStore);

      const jobId = 'fixture-job';
      const eventSelector = EventSelector.fromField(new Fr(2n));
      const contractAddress = AztecAddress.fromBigInt(3n);
      const scope = AztecAddress.fromBigInt(5n);
      const txHash = TxHash.fromBigInt(7n);
      const l2BlockHash = new BlockHash(new Fr(11n));

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        new Fr(13n),
        [new Fr(17n), new Fr(19n)],
        new Fr(23n),
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber: BlockNumber(29),
          l2BlockHash,
          txIndexInBlock: 31,
          eventIndexInTx: 37,
        },
        jobId,
      );
      await kvStore.transactionAsync(() => privateEventStore.commit(jobId));

      const events = kvStore.openMap<string, Buffer>('private_event_logs');
      const eventsByContractSelector = kvStore.openMultiMap<string, string>('events_by_contract_selector');
      const eventsByBlockNumber = kvStore.openMultiMap<number, string>('events_by_block_number');

      expect({
        schemaVersion: PXE_DATA_SCHEMA_VERSION,
        private_event_logs: await snapshotMap(events),
        events_by_contract_selector: await snapshotMultiMap(eventsByContractSelector),
        events_by_block_number: await snapshotMultiMap(eventsByBlockNumber),
      }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });
});
