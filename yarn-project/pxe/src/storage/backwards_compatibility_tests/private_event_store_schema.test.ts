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
  it('persists private events across all three sub-stores with multi-scope and multi-value rows', async () => {
    const kvStore = await openTmpStore('pxe-schema-private-event', true);
    try {
      const privateEventStore = new PrivateEventStore(kvStore);

      const jobId = 'fixture-job';

      // Two (contract, selector) pairs and two block numbers so each multimap exhibits both a multi-value row
      // (contractA/selectorA → {e1, e2} and blockN1 → {e1, e2}) and a contrasting single-value row.
      const contractA = AztecAddress.fromBigInt(2n);
      const contractB = AztecAddress.fromBigInt(3n);
      const selectorA = EventSelector.fromField(new Fr(5n));
      const selectorB = EventSelector.fromField(new Fr(7n));
      const scopeX = AztecAddress.fromBigInt(11n);
      const scopeY = AztecAddress.fromBigInt(13n);
      const blockN1 = BlockNumber(17);
      const blockN2 = BlockNumber(19);

      // event1: rich fixture. Re-stored under scopeY below to exercise the `addScope` branch and produce a
      // 2-element scopes vector in the committed buffer.
      const event1Commitment = new Fr(23n);
      await privateEventStore.storePrivateEventLog(
        selectorA,
        new Fr(29n),
        [new Fr(31n), new Fr(37n), new Fr(41n)],
        event1Commitment,
        {
          contractAddress: contractA,
          scope: scopeX,
          txHash: TxHash.fromField(new Fr(43n)),
          l2BlockNumber: blockN1,
          l2BlockHash: new BlockHash(new Fr(47n)),
          txIndexInBlock: 53,
          eventIndexInTx: 59,
        },
        jobId,
      );

      // Same eventId, different scope: takes the `existing.addScope(...)` path in `storePrivateEventLog`.
      await privateEventStore.storePrivateEventLog(
        selectorA,
        new Fr(29n),
        [new Fr(31n), new Fr(37n), new Fr(41n)],
        event1Commitment,
        {
          contractAddress: contractA,
          scope: scopeY,
          txHash: TxHash.fromField(new Fr(43n)),
          l2BlockNumber: blockN1,
          l2BlockHash: new BlockHash(new Fr(47n)),
          txIndexInBlock: 53,
          eventIndexInTx: 59,
        },
        jobId,
      );

      // event2: same (contract, selector) and same block as event1 → multi-value rows in both multimaps.
      await privateEventStore.storePrivateEventLog(
        selectorA,
        new Fr(61n),
        [new Fr(67n), new Fr(71n), new Fr(73n)],
        new Fr(79n),
        {
          contractAddress: contractA,
          scope: scopeX,
          txHash: TxHash.fromField(new Fr(83n)),
          l2BlockNumber: blockN1,
          l2BlockHash: new BlockHash(new Fr(89n)),
          txIndexInBlock: 97,
          eventIndexInTx: 101,
        },
        jobId,
      );

      // event3: distinct (contract, selector) and block → contrasting single-value multimap rows.
      await privateEventStore.storePrivateEventLog(
        selectorB,
        new Fr(103n),
        [new Fr(107n), new Fr(109n), new Fr(113n)],
        new Fr(127n),
        {
          contractAddress: contractB,
          scope: scopeX,
          txHash: TxHash.fromField(new Fr(131n)),
          l2BlockNumber: blockN2,
          l2BlockHash: new BlockHash(new Fr(137n)),
          txIndexInBlock: 139,
          eventIndexInTx: 149,
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
