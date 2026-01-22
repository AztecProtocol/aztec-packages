// This window has to be as large as the largest expected number of logs emitted in a tx for a given directional app
// tagging secret. If we get more tag indexes consumed than this window, an error is thrown in `PXE::proveTx` function.
// This is set to a larger value than MAX_PRIVATE_LOGS_PER_TX (currently 64) because there could be more than
// MAX_PRIVATE_LOGS_PER_TX indexes consumed in case the logs are squashed. This happens when the log contains a note
// and the note is nullified in the same tx.
//
// Having a large window significantly slowed down `e2e_l1_with_wall_time` test as there we perform sync for more than
// 1000 secrets. For this reason we set it to a relatively low value of 20. 20 should be sufficient for all the use
// cases.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = 20;
