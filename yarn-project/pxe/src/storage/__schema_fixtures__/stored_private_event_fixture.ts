import { Fr } from '@aztec/foundation/curves/bn254';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

import { StoredPrivateEvent } from '../private_event_store/stored_private_event.js';

/** The type name reported by the schema-compatibility test for `StoredPrivateEvent` fixtures. */
export const STORED_PRIVATE_EVENT_FIXTURE_TYPE_NAME = 'StoredPrivateEvent';

/**
 * Builds a deterministic, fully-populated `StoredPrivateEvent` for the schema-compatibility snapshot.
 * `StoredPrivateEvent` has no optional fields, so the suite contains a single canonical instance.
 */
export function buildStoredPrivateEventFixtures(): StoredPrivateEvent[] {
  return [
    new StoredPrivateEvent(
      new Fr(2n),
      [new Fr(3n), new Fr(5n)],
      7,
      new BlockHash(new Fr(11n)),
      TxHash.fromField(new Fr(13n)),
      17,
      19,
      AztecAddress.fromBigInt(23n),
      EventSelector.fromField(new Fr(29n)),
      new Set(['fixture-scope-a', 'fixture-scope-b']),
    ),
  ];
}
