#pragma once

namespace proof_system::merkle {
// TODO(https://github.com/AztecProtocol/barretenberg/issues/426)
enum HashType { FIXED_BASE_PEDERSEN, LOOKUP_PEDERSEN, NONE };
} // namespace proof_system::merkle