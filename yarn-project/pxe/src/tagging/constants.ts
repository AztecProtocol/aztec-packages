// The maximum number of tagging indexes a sender may use ahead of the highest finalized index for a given directional
// app tagging secret. A sender that tries to use an index beyond it throws in the `PXE::proveTx` function. It therefore
// has to be at least as large as the largest number of indexes a single tx is expected to consume for one directional
// app secret. That number can in theory exceed MAX_PRIVATE_LOGS_PER_TX (currently 64), because squashing (a note
// created and nullified in the same tx) consumes an index without emitting a persisted log, but in practice it stays
// well below that.
//
// A large window significantly slowed down the `e2e_l1_with_wall_time` test, which syncs more than 1000 secrets, so we
// set it to a relatively low value of 20, which is sufficient for current use cases.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = 20;

// The number of tags probed per constrained secret in the first round. The probe then doubles each round (1, 2, 4, ...,
// capped at UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN) while every probed index is a hit, stopping at the first missing tag.
// Constrained delivery is gapless, so a single missing tag proves the stream has ended: at steady state this turns a full
// WINDOW_LEN probe into a single tag. A secret K logs behind catches up in ~log2(K) round-trips while the probe is still
// doubling (1, 2, 4, 8, 16), but once it saturates the cap and advances WINDOW_LEN tags per round, deeper catch-up is
// linear at ~K/WINDOW_LEN rounds. Either way it beats both the full window every round and one round per log.
export const INITIAL_CONSTRAINED_PROBE_LEN = 1;
