import { MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';

// This window bounds how far a sender's next tag index for a directional app tagging secret can run ahead of that
// secret's highest finalized (observed-as-mined) index before `PXE::proveTx` throws.
//
// The floor is MAX_PRIVATE_LOGS_PER_TX: the private kernel accumulates every private log emitted by a tx, across its
// whole call stack, into a single tx-wide array of exactly this size before any squashing runs (`PrivateAccumulatedData`
// in noir-protocol-circuits). So no tx, however constructed, can tag more than MAX_PRIVATE_LOGS_PER_TX logs with one
// secret, and a fresh secret's very first tx can consume that many indexes before anything is finalized. Kernel
// squashing (a note created and nullified within the same tx) only ever removes entries from that already-bounded
// array — it can't push a tx's consumption past this floor, so squashing isn't a reason to go any higher by itself.
//
// The +20 on top is headroom for multiple pending (not-yet-mined) txs to the same counterparty stacking up before the
// first one is observed as mined. Only a run of near-MAX_PRIVATE_LOGS_PER_TX txs back-to-back would exhaust this;
// ordinary transfers use far fewer logs per tx, so the same margin covers many more of those. Keep the margin
// additive rather than another multiple of the floor — a larger window also makes recipient-side sync more
// expensive, since discovery has to probe ahead of the last finalized index for every active secret.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = MAX_PRIVATE_LOGS_PER_TX + 20;
