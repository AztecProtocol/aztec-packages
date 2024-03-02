#pragma once
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/circuit_builder/circuit_builder_base.hpp"
#include "barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/relations/auxiliary_relation.hpp"
#include "barretenberg/relations/ecc_op_queue_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/gen_perm_sort_relation.hpp"
#include "barretenberg/relations/lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"

#include <optional>

namespace bb {

using namespace bb;

class CircuitChecker {
  public:
    using FF = bb::fr;
    using Arithmetic = UltraArithmeticRelation<FF>;
    using Elliptic = EllipticRelation<FF>;
    using Auxiliary = AuxiliaryRelation<FF>;
    using GenPermSort = GenPermSortRelation<FF>;

    template <typename Builder> static bool check(Builder& builder);

    template <typename Relation, typename Builder> static bool check_relation(Builder& builder);

    template <typename Builder> static bool check_arithmetic_relation(Builder& builder);

    template <typename Builder> static void populate_values(Builder& builder, auto& values, size_t idx);
};
} // namespace bb
