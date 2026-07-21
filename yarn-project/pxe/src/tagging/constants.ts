import { MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';

<<<<<<< HEAD
// This window has to cover the largest expected number of unfinalized logs emitted for a given directional app tagging
// secret. If more tag indexes are consumed than this window, an error is thrown in `PXE::proveTx`.
//
// Having a large window significantly slowed down `e2e_l1_with_wall_time` test as there we perform sync for more than
// 1000 secrets, so keep this bounded to the per-tx private log limit.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = MAX_PRIVATE_LOGS_PER_TX;
=======
// This window bounds how far a sender's next tag index for a directional app tagging secret can run ahead of that
// secret's highest finalized index before `PXE::proveTx` throws.
//
// MAX_PRIVATE_LOGS_PER_TX is a floor for ordinary transaction patterns: the private kernel accumulates every
// surviving private log into a single tx-wide array of exactly this size, so a fresh secret's very first
// ordinary tx can consume that many indexes before anything is finalized.
//
// The +20 on top is headroom for multiple pending ordinary txs to the same counterparty stacking up
// before the first one is observed as mined. Only a run of near-MAX_PRIVATE_LOGS_PER_TX txs back-to-back would
// exhaust this; ordinary transfers use far fewer logs per tx, so the same margin covers many more of those. Keep the
// margin additive rather than another multiple of the floor. A larger window also makes recipient-side sync more
// expensive, since discovery has to probe ahead of the last finalized index for every active secret.
//
// TODO(F-783): MAX_PRIVATE_LOGS_PER_TX is not a hard ceiling in general — a tx that creates and nullifies (squashes)
// many notes/logs to the same secret can drive that secret's raw tag index arbitrarily higher, since indexes are
// reserved at log emission time, before squashing is decided, and the kernel's reset/squash loop is not bounded by
// MAX_PRIVATE_LOGS_PER_TX. No fixed window value closes that gap.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = MAX_PRIVATE_LOGS_PER_TX + 20;
>>>>>>> origin/v5-next
