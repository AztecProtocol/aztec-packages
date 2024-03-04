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

    struct TagCheckData {
        // We use a running tag product mechanism to ensure tag correctness
        // This is the product of (value + γ ⋅ tag)
        FF left_product = FF::one();
        // This is the product of (value + γ ⋅ tau[tag])
        FF right_product = FF::one();
        // Randomness for the tag check
        const FF gamma = FF::random_element();
        const FF eta = FF::random_element();
        // We need to include each variable only once
        std::unordered_set<size_t> encountered_variables;
        // Hash tables for memory read/write indices to efficiently determine if a row is a memory read/write
        std::unordered_set<size_t> memory_read_record_gates;
        std::unordered_set<size_t> memory_write_record_gates;

        TagCheckData(const auto& builder)
        {
            for (const auto& gate_idx : builder.memory_read_records) {
                memory_read_record_gates.insert(gate_idx);
            }
            for (const auto& gate_idx : builder.memory_write_records) {
                memory_write_record_gates.insert(gate_idx);
            }
        }
    };

    template <typename Builder> static bool check(const Builder& builder);

    template <typename Relation> static bool check_relation(auto& values, auto& params);

    static bool check_lookup(auto& values, auto& table_hash);

    static bool check_tag_data(const TagCheckData& tag_data);

    template <typename Builder>
    static void populate_values(Builder& builder, auto& values, size_t idx, TagCheckData& tag_data);

    // A hashing implementation for quick simulation lookups
    struct HashFrTuple {
        const FF mult_const = FF(uint256_t(0x1337, 0x1336, 0x1335, 0x1334));
        const FF mc_sqr = mult_const.sqr();
        const FF mc_cube = mult_const * mc_sqr;

        size_t operator()(const std::array<FF, 4>& entry) const
        {
            FF result = entry[0] + mult_const * entry[1] + mc_sqr * entry[2] + mc_cube * entry[3];
            return static_cast<size_t>(result.reduce_once().data[0]);
        }
    };
};
} // namespace bb
