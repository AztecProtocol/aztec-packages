#include "pedersen_plookup.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen_lookup.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen_lookup.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "pedersen.hpp"

namespace test_stdlib_pedersen {
using namespace barretenberg;
using namespace proof_system::plonk;
namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace plookup_pedersen_tests {
using Builder = proof_system::CircuitSimulatorBN254;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;

TEST(stdlib_pedersen, test_pedersen_plookup)
{
    Builder composer = Builder();

    fr left_in = fr::random_element();
    fr right_in = fr::random_element();

    field_ct left = witness_ct(&composer, left_in);
    field_ct right = witness_ct(&composer, right_in);

    field_ct result = stdlib::pedersen_plookup_commitment<Builder>::compress(left, right);

    fr expected = crypto::pedersen_hash::lookup::hash_pair(left_in, right_in);

    EXPECT_EQ(result.get_value(), expected);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_pedersen, test_compress_many_plookup)
{
    Builder composer = Builder();

    std::vector<fr> input_values{
        fr::random_element(), fr::random_element(), fr::random_element(),
        fr::random_element(), fr::random_element(), fr::random_element(),
    };
    std::vector<field_ct> inputs;
    for (const auto& input : input_values) {
        inputs.emplace_back(witness_ct(&composer, input));
    }

    const size_t hash_idx = 20;

    field_ct result = stdlib::pedersen_plookup_commitment<Builder>::compress(inputs, hash_idx);

    auto expected = crypto::pedersen_commitment::lookup::compress_native(input_values, hash_idx);

    EXPECT_EQ(result.get_value(), expected);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_pedersen, test_merkle_damgard_compress_plookup)
{
    Builder composer = Builder();

    std::vector<fr> input_values{
        fr::random_element(), fr::random_element(), fr::random_element(),
        fr::random_element(), fr::random_element(), fr::random_element(),
    };
    std::vector<field_ct> inputs;
    for (const auto& input : input_values) {
        inputs.emplace_back(witness_ct(&composer, input));
    }
    field_ct iv = witness_ct(&composer, fr(10));

    field_ct result = stdlib::pedersen_plookup_commitment<Builder>::merkle_damgard_compress(inputs, iv).x;

    auto expected = crypto::pedersen_commitment::lookup::merkle_damgard_compress(input_values, 10);

    EXPECT_EQ(result.get_value(), expected.normalize().x);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_pedersen, test_merkle_damgard_compress_multiple_iv_plookup)
{
    Builder composer = Builder();

    const size_t m = 10;
    std::vector<fr> input_values;
    std::vector<size_t> iv_values;
    for (size_t i = 0; i < m; i++) {
        input_values.push_back(fr::random_element());
        iv_values.push_back(engine.get_random_uint8());
    }

    std::vector<field_ct> inputs;
    std::vector<field_ct> ivs;
    for (size_t i = 0; i < m; i++) {
        inputs.emplace_back(witness_ct(&composer, input_values[i]));
        ivs.emplace_back(witness_ct(&composer, fr(iv_values[i])));
    }

    field_ct result = stdlib::pedersen_plookup_commitment<Builder>::merkle_damgard_compress(inputs, ivs).x;

    auto expected = crypto::pedersen_commitment::lookup::merkle_damgard_compress(input_values, iv_values);

    EXPECT_EQ(result.get_value(), expected.normalize().x);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_pedersen, test_merkle_damgard_tree_compress_plookup)
{
    Builder composer = Builder();

    const size_t m = 16;
    std::vector<fr> input_values;
    std::vector<size_t> iv_values;
    for (size_t i = 0; i < m; i++) {
        input_values.push_back(fr::random_element());
        iv_values.push_back(engine.get_random_uint8());
    }

    std::vector<field_ct> inputs;
    std::vector<field_ct> ivs;
    for (size_t i = 0; i < m; i++) {
        inputs.emplace_back(witness_ct(&composer, input_values[i]));
        ivs.emplace_back(witness_ct(&composer, fr(iv_values[i])));
    }

    field_ct result = stdlib::pedersen_plookup_commitment<Builder>::merkle_damgard_tree_compress(inputs, ivs).x;

    auto expected = crypto::pedersen_commitment::lookup::merkle_damgard_tree_compress(input_values, iv_values);

    EXPECT_EQ(result.get_value(), expected.normalize().x);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

} // namespace plookup_pedersen_tests
} // namespace test_stdlib_pedersen
