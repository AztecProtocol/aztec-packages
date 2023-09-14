#pragma once

namespace proof_system::pedersen {
// TODO(https://github.com/AztecProtocol/barretenberg/issues/426)
enum CommitmentType { FIXED_BASE_PEDERSEN, LOOKUP_PEDERSEN, NONE };
} // namespace proof_system::pedersen