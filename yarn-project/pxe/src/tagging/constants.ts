import { MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';

// This window bounds how far a sender's next tag index for a directional app tagging secret can run ahead of that
// secret's highest finalized (observed-as-mined) index before `PXE::proveTx` throws.
//
// The floor is MAX_PRIVATE_LOGS_PER_TX (currently 64, matching MAX_NOTE_HASHES_PER_TX): a single tx can tag that many
// logs with the same secret, so a fresh secret's very first tx can consume that many indexes before anything is
// finalized. Kernel squashing (a note created and nullified within the same tx) only trims the surviving range down;
// it can't push a tx past this per-tx cap, so squashing isn't a reason to go any higher than the floor by itself.
//
// The +20 on top is headroom for multiple pending (not-yet-mined) txs to the same counterparty stacking up before the
// first one is observed as mined. Only a run of near-MAX_PRIVATE_LOGS_PER_TX txs back-to-back would exhaust this;
// ordinary transfers use far fewer logs per tx, so the same margin covers many more of those. Keep the margin
// additive rather than another multiple of the floor — a larger window also makes recipient-side sync more
// expensive, since discovery has to probe ahead of the last finalized index for every active secret.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = 20;
