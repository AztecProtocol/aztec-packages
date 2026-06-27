import { MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';

// This window has to cover the largest expected number of tag indexes consumed for a given directional app tagging
// secret before those indexes are finalized. If more tag indexes are consumed than this window allows, an error is
// thrown in `PXE::proveTx`.
//
// Keep the window tied to MAX_PRIVATE_LOGS_PER_TX so a single tx can consume the full private-log capacity, and
// benchmark blocks can keep several same-secret txs pending without forcing a large sync scan for every secret.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = MAX_PRIVATE_LOGS_PER_TX;
