// === AUDIT STATUS ===
// internal:    { status: complete, auditors: [luke], date: 2025-04-17 }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "sumcheck.hpp"

// Hack to make the module compile.

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1102): this makes the module not empty (note the comment
// above pre-existed)
void fixme_compile_hack() {}
