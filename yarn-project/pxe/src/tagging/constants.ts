// This window bounds how far a sender's next tag index for a directional app tagging secret can run ahead of that
// secret's highest finalized (observed-as-mined) index before `PXE::proveTx` throws.
//
// It must cover the worst case of a single tx: MAX_PRIVATE_LOGS_PER_TX (currently 64, matching MAX_NOTE_HASHES_PER_TX)
// logs can all be tagged with the same secret in one tx, so a fresh secret's very first tx can consume that many
// indexes before anything is finalized. A larger window also makes recipient-side sync more expensive, since
// discovery has to probe ahead of the last finalized index for every active secret.
//
// EXPERIMENT (draft PR, not for merge): set below the safe minimum on purpose, to check whether #24429's bump to
// MAX_PRIVATE_LOGS_PER_TX was needed to pass CI now that the client-flows bench uses address-derived secrets again.
// Do not ship this value — see PR description.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = 20;
