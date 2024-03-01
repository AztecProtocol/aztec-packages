#pragma once
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/execution_trace/execution_trace.hpp"
#include "barretenberg/proof_system/op_queue/ecc_op_queue.hpp"
#include "barretenberg/proof_system/plookup_tables/plookup_tables.hpp"
#include "barretenberg/proof_system/plookup_tables/types.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include "barretenberg/proof_system/types/merkle_hash_type.hpp"
#include "barretenberg/proof_system/types/pedersen_commitment_type.hpp"
#include "circuit_builder_base.hpp"
#include "ultra_circuit_builder.hpp"
#include <optional>

namespace bb {

using namespace bb;

class CircuitChecker {
  public:
    template <typename Builder> static bool check(Builder& builder);
};
} // namespace bb
