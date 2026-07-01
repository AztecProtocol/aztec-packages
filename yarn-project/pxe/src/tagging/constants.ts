import { MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';

// This window has to cover the largest expected number of unfinalized logs emitted for a given directional app tagging
// secret. If more tag indexes are consumed than this window, an error is thrown in `PXE::proveTx`.
//
// Having a large window significantly slowed down `e2e_l1_with_wall_time` test as there we perform sync for more than
// 1000 secrets, so keep this bounded to the per-tx private log limit.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = MAX_PRIVATE_LOGS_PER_TX;
