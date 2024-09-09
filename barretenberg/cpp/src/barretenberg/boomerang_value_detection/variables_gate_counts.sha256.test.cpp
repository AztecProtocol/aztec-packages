#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;

using byte_array_ct = byte_array<Builder>;
using packed_byte_array_ct = packed_byte_array<Builder>;
using field_ct = field_t<Builder>;

TEST(ultra_circuit_constructor, test_variables_gate_counts_for_sha256_55_bytes)
{
    // 55 bytes is the largest number of bytes that can be hashed in a single block,
    // accounting for the single padding bit, and the 64 size bits required by the SHA-256 standard.
    auto builder = Builder();
    packed_byte_array_ct input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");

    packed_byte_array_ct output_bits = stdlib::sha256(input);

    // std::vector<field_ct> output = output_bits.to_unverified_byte_slices(4);

    Graph graph = Graph(builder);
    std::unordered_set<uint32_t> variables_in_on_gate = graph.show_variables_in_one_gate(builder);
    for (const auto& elem : variables_in_on_gate) {
        info("elem == ", elem);
    }
}