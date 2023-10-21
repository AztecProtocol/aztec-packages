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
typedef stdlib::field_t<proof_system::UltraCircuitBuilder> field_ct;
typedef stdlib::witness_t<proof_system::UltraCircuitBuilder> witness_ct;
TEST(stdlib_pedersen, test_pedersen_plookup)
{
    proof_system::UltraCircuitBuilder builder = proof_system::UltraCircuitBuilder();

    fr left_in = fr::random_element();
    fr right_in = fr::random_element();

    field_ct left = witness_ct(&builder, left_in);
    field_ct right = witness_ct(&builder, right_in);

    field_ct result = stdlib::pedersen_plookup_commitment<proof_system::UltraCircuitBuilder>::compress(left, right);

    fr expected = crypto::pedersen_hash::lookup::hash_pair(left_in, right_in);

    EXPECT_EQ(result.get_value(), expected);

    info("num gates = ", builder.get_num_gates());

    bool proof_result = builder.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_pedersen, test_compress_many_plookup)
{
    proof_system::UltraCircuitBuilder builder = proof_system::UltraCircuitBuilder();

    std::vector<fr> input_values{
        fr::random_element(), fr::random_element(), fr::random_element(),
        fr::random_element(), fr::random_element(), fr::random_element(),
    };
    std::vector<field_ct> inputs;
    for (const auto& input : input_values) {
        inputs.emplace_back(witness_ct(&builder, input));
    }

    const size_t hash_idx = 20;

    field_ct result =
        stdlib::pedersen_plookup_commitment<proof_system::UltraCircuitBuilder>::compress(inputs, hash_idx);

    auto expected = crypto::pedersen_commitment::lookup::compress_native(input_values, hash_idx);

    EXPECT_EQ(result.get_value(), expected);

    info("num gates = ", builder.get_num_gates());

    bool proof_result = builder.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_pedersen, test_merkle_damgard_compress_plookup)
{
    proof_system::UltraCircuitBuilder builder = proof_system::UltraCircuitBuilder();

    std::vector<fr> input_values{
        fr::random_element(), fr::random_element(), fr::random_element(),
        fr::random_element(), fr::random_element(), fr::random_element(),
    };
    std::vector<field_ct> inputs;
    for (const auto& input : input_values) {
        inputs.emplace_back(witness_ct(&builder, input));
    }
    field_ct iv = witness_ct(&builder, fr(10));

    field_ct result =
        stdlib::pedersen_plookup_commitment<proof_system::UltraCircuitBuilder>::merkle_damgard_compress(inputs, iv).x;

    auto expected = crypto::pedersen_commitment::lookup::merkle_damgard_compress(input_values, 10);

    EXPECT_EQ(result.get_value(), expected.normalize().x);

    info("num gates = ", builder.get_num_gates());

    bool proof_result = builder.check_circuit();
    EXPECT_EQ(proof_result, true);
}

} // namespace plookup_pedersen_tests
} // namespace test_stdlib_pedersen
