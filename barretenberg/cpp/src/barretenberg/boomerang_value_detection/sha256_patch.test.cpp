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

#include <array>

#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;

using byte_array_ct = byte_array<Builder>;
using packed_byte_array_ct = packed_byte_array<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using field_ct = field_t<Builder>;

TEST(ultra_circuit_constructor, test_sha256_after_patch)
{
    // 55 bytes is the largest number of bytes that can be hashed in a single block,
    // accounting for the single padding bit, and the 64 size bits required by the SHA-256 standard.
    auto builder = Builder();
    packed_byte_array_ct input(&builder, "An 8 character password? Snow White and the 7 Dwarves..");

    packed_byte_array_ct output_bits = stdlib::sha256(input);

    // std::vector<field_ct> output = output_bits.to_unverified_byte_slices(4);

    info("num of gates == ", builder.get_num_gates());
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TEST(ultra_circuit_constructor, test_boomerang_value_in_extend_witness_function)
{
    auto builder = Builder();
    std::array<field_t<Builder>, 16> input;
    for (size_t i = 0; i < 16; i++) {
        auto variable = fr::random_element();
        auto var_slice = uint256_t(variable).slice(0, 32);
        field_ct elt(witness_ct(&builder, fr(var_slice)));
        builder.fix_witness(elt.witness_index, elt.get_value());
        input[i] = elt;
    }
    std::array<field_t<Builder>, 64> w_ext = sha256_plookup::extend_witness(input);
    bool result1 = CircuitChecker::check(builder);
    EXPECT_EQ(result1, true);
    for (size_t i = 0; i < w_ext.size(); i++) {
        auto change_variable = fr::random_element();
        auto change_var_slice = uint256_t(change_variable).slice(0, 32);
        field_t change_elt(&builder, fr(change_var_slice));
        uint32_t variable_index = w_ext[i].witness_index;
        if (builder.variables[builder.real_variable_index[variable_index]] != fr(change_var_slice)) {
            builder.variables[builder.real_variable_index[variable_index]] = fr(change_var_slice);
            bool result2 = CircuitChecker::check(builder);
            EXPECT_EQ(result2, false);
            break;
        }
    }
}