#include "poseidon2.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Builder> class StdlibPoseidon2 : public testing::Test {
    using _curve = stdlib::bn254<Builder>;

    using byte_array_ct = typename _curve::byte_array_ct;
    using field_ct = typename _curve::ScalarField;
    using witness_ct = typename _curve::witness_ct;
    using public_witness_ct = typename _curve::public_witness_ct;
    using poseidon2 = typename stdlib::poseidon2<Builder>;
    using native_poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

  public:
    /**
     * @brief Call poseidon2 on a vector of inputs
     *
     * @param num_inputs
     */
    static void test_hash(size_t num_inputs)
    {
        using field_ct = stdlib::field_t<Builder>;
        using witness_ct = stdlib::witness_t<Builder>;
        auto builder = Builder();

        std::vector<field_ct> inputs;
        std::vector<fr> inputs_native;

        for (size_t i = 0; i < num_inputs; ++i) {
            const auto element = fr::random_element(&engine);
            inputs_native.emplace_back(element);
            inputs.emplace_back(field_ct(witness_ct(&builder, element)));
        }
        size_t num_gates_start = builder.get_estimated_num_finalized_gates();

        auto result = stdlib::poseidon2<Builder>::hash(inputs);
        auto expected = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs_native);
        if (num_inputs == 1) {
            EXPECT_EQ(73, builder.get_estimated_num_finalized_gates() - num_gates_start);
        }

        EXPECT_EQ(result.get_value(), expected);

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    /**
     * @brief Call poseidon2 on two inputs repeatedly.
     *
     * @param num_inputs
     */
    static void test_hash_repeated_pairs(size_t num_inputs)
    {
        Builder builder;

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();

        field_ct left = witness_ct(&builder, left_in);
        field_ct right = witness_ct(&builder, right_in);

        // num_inputs - 1 iterations since the first hash hashes two elements
        for (size_t i = 0; i < num_inputs - 1; ++i) {
            left = poseidon2::hash({ left, right });
        }

        builder.set_public_input(left.witness_index);

        info("num gates = ", builder.get_estimated_num_finalized_gates());

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_hash_zeros(size_t num_inputs)
    {
        Builder builder;

        std::vector<fr> inputs;
        inputs.reserve(num_inputs);
        std::vector<stdlib::field_t<Builder>> witness_inputs;

        for (size_t i = 0; i < num_inputs; ++i) {
            inputs.emplace_back(0);
            witness_inputs.emplace_back(witness_ct(&builder, inputs[i]));
        }

        fr expected = native_poseidon2::hash(inputs);
        auto result = poseidon2::hash(witness_inputs);

        EXPECT_EQ(result.get_value(), expected);
    }

    static void test_hash_constants()
    {
        Builder builder;

        std::vector<fr> inputs;
        std::vector<field_ct> witness_inputs;

        for (size_t i = 0; i < 8; ++i) {
            inputs.push_back(bb::fr::random_element());
            if (i % 2 == 1) {
                witness_inputs.push_back(witness_ct(&builder, inputs[i]));
            } else {
                witness_inputs.push_back(field_ct(&builder, inputs[i]));
            }
        }

        native_poseidon2::hash(inputs);
        EXPECT_THROW_OR_ABORT(poseidon2::hash(witness_inputs), ".*Sponge inputs should not be stdlib constants.*");
    }

    static void test_padding_collisions()
    {
        Builder builder;

        const field_ct random_input(witness_ct(&builder, fr::random_element()));
        const field_ct zero(witness_ct(&builder, 0));

        std::vector<field_ct> witness_inputs_len_1{ random_input };
        std::vector<field_ct> witness_inputs_len_2{ random_input, zero };
        std::vector<field_ct> witness_inputs_len_3{ random_input, zero, zero };
        std::vector<std::vector<field_ct>> inputs{ witness_inputs_len_1, witness_inputs_len_2, witness_inputs_len_3 };

        std::vector<fr> hashes(3);

        for (size_t idx = 0; idx < 3; idx++) {
            hashes[idx] = poseidon2::hash(inputs[idx]).get_value();
        }

        // The domain separation IV depends on the input size, therefore, the hashes must not coincide.
        EXPECT_NE(hashes[1], hashes[2]);
        EXPECT_NE(hashes[2], hashes[3]);
        EXPECT_NE(hashes[1], hashes[3]);
    }
};

using CircuitTypes = testing::Types<bb::MegaCircuitBuilder, bb::UltraCircuitBuilder>;

TYPED_TEST_SUITE(StdlibPoseidon2, CircuitTypes);

TYPED_TEST(StdlibPoseidon2, TestHashZeros)
{
    TestFixture::test_hash_zeros(8);
};

TYPED_TEST(StdlibPoseidon2, TestHashSmall)
{
    TestFixture::test_hash(1); // 73
    // TestFixture::test_hash(2);  // 74
    // TestFixture::test_hash(3);  // 74
    // TestFixture::test_hash(4);  // 148
    // TestFixture::test_hash(5);  // 149
    TestFixture::test_hash(6);  // 150
    TestFixture::test_hash(10); // 300
    TestFixture::test_hash(16); // 452
    TestFixture::test_hash(17); // 453
    TestFixture::test_hash(18); // 454
    TestFixture::test_hash(23); // 454
    TestFixture::test_hash(24); // 454
}

TYPED_TEST(StdlibPoseidon2, TestHashLarge)
{
    TestFixture::test_hash(1000);
}

TYPED_TEST(StdlibPoseidon2, TestHashRepeatedPairs)
{
    TestFixture::test_hash_repeated_pairs(256);
}

TYPED_TEST(StdlibPoseidon2, TestHashConstants)
{
    TestFixture::test_hash_constants();
};
TYPED_TEST(StdlibPoseidon2, TestHashPadding)
{
    TestFixture::test_padding_collisions();
};
