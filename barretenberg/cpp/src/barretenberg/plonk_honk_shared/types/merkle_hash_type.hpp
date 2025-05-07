// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

namespace bb::merkle {
// TODO(https://github.com/AztecProtocol/barretenberg/issues/426)
enum HashType { FIXED_BASE_PEDERSEN, LOOKUP_PEDERSEN };
} // namespace bb::merkle
