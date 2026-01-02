// === AUDIT STATUS ===
// internal:    { status: complete, auditors: [luke], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "sumcheck.hpp"

// Hack to make the module compile.

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1102): this makes the module not empty (note the comment
// above pre-existed)
void fixme_compile_hack() {}
