#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "pedersen.hpp"

namespace test_stdlib_pedersen {
using namespace barretenberg;
using namespace proof_system::plonk;
namespace {
auto& engine = numeric::random::get_debug_engine();
}

template <typename Composer> class stdlib_pedersen : public testing::Test {
    using _curve = stdlib::bn254<Composer>;

    using byte_array_ct = typename _curve::byte_array_ct;
    using fr_ct = typename _curve::ScalarField;
    using witness_ct = typename _curve::witness_ct;
    using public_witness_ct = typename _curve::public_witness_ct;
    using pedersen_commitment = typename stdlib::pedersen_commitment<Composer>;

  public:
    static void test_pedersen()
    {

        Composer composer;

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();

        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }

        fr_ct left = public_witness_ct(&composer, left_in);
        fr_ct right = witness_ct(&composer, right_in);

        composer.fix_witness(left.witness_index, left.get_value());
        composer.fix_witness(right.witness_index, right.get_value());

        fr_ct out = pedersen_commitment::compress(left, right);

        info("composer gates = ", composer.get_num_gates());

        bool result = composer.check_circuit();
        EXPECT_EQ(result, true);

        fr compress_native = crypto::pedersen_commitment<typename curve::Grumpkin>::compress_native(
            { left.get_value(), right.get_value() });
        EXPECT_EQ(out.get_value(), compress_native);
    }

    static void test_pedersen_edge_cases()
    {
        Composer composer;

        fr zero_fr = fr::zero();
        fr one_fr = fr::one();
        fr r_minus_one_fr = fr::modulus - 1;
        fr r_minus_two_fr = fr::modulus - 2;
        fr r_fr = fr::modulus;

        fr_ct zero = witness_ct(&composer, zero_fr);
        fr_ct one = witness_ct(&composer, one_fr);
        fr_ct r_minus_one = witness_ct(&composer, r_minus_one_fr);
        fr_ct r_minus_two = witness_ct(&composer, r_minus_two_fr);
        fr_ct r = witness_ct(&composer, r_fr);

        fr_ct out_1_with_zero = pedersen_commitment::compress(zero, one);
        fr_ct out_1_with_r = pedersen_commitment::compress(r, one);
        fr_ct out_2 = pedersen_commitment::compress(r_minus_one, r_minus_two);
        fr_ct out_with_zero = pedersen_commitment::compress(out_1_with_zero, out_2);
        fr_ct out_with_r = pedersen_commitment::compress(out_1_with_r, out_2);

        info("composer gates = ", composer.get_num_gates());

        bool result = composer.check_circuit();
        EXPECT_EQ(result, true);

        EXPECT_EQ(bool(out_1_with_zero.get_value() == out_1_with_r.get_value()), true);

        fr compress_native_1_with_zero =
            crypto::pedersen_commitment::compress_native({ zero.get_value(), one.get_value() });
        fr compress_native_1_with_r = crypto::pedersen_commitment::compress_native({ r.get_value(), one.get_value() });
        fr compress_native_2 =
            crypto::pedersen_commitment::compress_native({ r_minus_one.get_value(), r_minus_two.get_value() });
        fr compress_native_with_zero =
            crypto::pedersen_commitment::compress_native({ out_1_with_zero.get_value(), out_2.get_value() });
        fr compress_native_with_r =
            crypto::pedersen_commitment::compress_native({ out_1_with_r.get_value(), out_2.get_value() });

        EXPECT_EQ(out_1_with_zero.get_value(), compress_native_1_with_zero);
        EXPECT_EQ(out_1_with_r.get_value(), compress_native_1_with_r);
        EXPECT_EQ(out_2.get_value(), compress_native_2);
        EXPECT_EQ(out_with_zero.get_value(), compress_native_with_zero);
        EXPECT_EQ(out_with_r.get_value(), compress_native_with_r);
        EXPECT_EQ(compress_native_with_zero, compress_native_with_r);
    }

    static void test_pedersen_large()
    {
        Composer composer;

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();
        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }
        fr_ct left = witness_ct(&composer, left_in);
        fr_ct right = witness_ct(&composer, right_in);

        for (size_t i = 0; i < 256; ++i) {
            left = pedersen_commitment::compress(left, right);
        }

        composer.set_public_input(left.witness_index);

        info("composer gates = ", composer.get_num_gates());

        bool result = composer.check_circuit();
        EXPECT_EQ(result, true);
    }

    static void test_compress_byte_array()
    {
        const size_t num_input_bytes = 351;

        Composer composer;

        std::vector<uint8_t> input;
        input.reserve(num_input_bytes);
        for (size_t i = 0; i < num_input_bytes; ++i) {
            input.push_back(engine.get_random_uint8());
        }

        fr expected = crypto::pedersen_commitment::compress_native(input);

        byte_array_ct circuit_input(&composer, input);
        auto result = pedersen_commitment::compress(circuit_input);

        EXPECT_EQ(result.get_value(), expected);

        info("composer gates = ", composer.get_num_gates());

        bool proof_result = composer.check_circuit();
        EXPECT_EQ(proof_result, true);
    }

    static void test_multi_compress()
    {
        Composer composer;

        for (size_t i = 0; i < 7; ++i) {
            std::vector<barretenberg::fr> inputs;
            inputs.push_back(barretenberg::fr::random_element());
            inputs.push_back(barretenberg::fr::random_element());
            inputs.push_back(barretenberg::fr::random_element());
            inputs.push_back(barretenberg::fr::random_element());

            if (i == 1) {
                inputs[0] = barretenberg::fr(0);
            }
            if (i == 2) {
                inputs[1] = barretenberg::fr(0);
                inputs[2] = barretenberg::fr(0);
            }
            if (i == 3) {
                inputs[3] = barretenberg::fr(0);
            }
            if (i == 4) {
                inputs[0] = barretenberg::fr(0);
                inputs[3] = barretenberg::fr(0);
            }
            if (i == 5) {
                inputs[0] = barretenberg::fr(0);
                inputs[1] = barretenberg::fr(0);
                inputs[2] = barretenberg::fr(0);
                inputs[3] = barretenberg::fr(0);
            }
            if (i == 6) {
                inputs[1] = barretenberg::fr(1);
            }
            std::vector<fr_ct> witnesses;
            for (auto input : inputs) {
                witnesses.push_back(witness_ct(&composer, input));
            }

            barretenberg::fr expected = crypto::pedersen_commitment::compress_native(inputs);

            fr_ct result = pedersen_commitment::compress(witnesses);
            EXPECT_EQ(result.get_value(), expected);
        }

        info("composer gates = ", composer.get_num_gates());

        bool proof_result = composer.check_circuit();
        EXPECT_EQ(proof_result, true);
    }

    static void test_compress_eight()
    {
        Composer composer;

        std::vector<grumpkin::fq> inputs;
        inputs.reserve(8);
        std::vector<stdlib::field_t<Composer>> witness_inputs;

        for (size_t i = 0; i < 8; ++i) {
            inputs.emplace_back(barretenberg::fr::random_element());
            witness_inputs.emplace_back(witness_ct(&composer, inputs[i]));
        }

        constexpr size_t hash_idx = 10;
        grumpkin::fq expected = crypto::pedersen_commitment::compress_native(inputs, hash_idx);
        auto result = pedersen_commitment::compress(witness_inputs, hash_idx);

        EXPECT_EQ(result.get_value(), expected);
    }

    static void test_compress_constants()
    {
        Composer composer;

        std::vector<barretenberg::fr> inputs;
        std::vector<stdlib::field_t<Composer>> witness_inputs;

        for (size_t i = 0; i < 8; ++i) {
            inputs.push_back(barretenberg::fr::random_element());
            if (i % 2 == 1) {
                witness_inputs.push_back(witness_ct(&composer, inputs[i]));
            } else {
                witness_inputs.push_back(fr_ct(&composer, inputs[i]));
            }
        }

        barretenberg::fr expected = crypto::pedersen_commitment::compress_native(inputs);
        auto result = pedersen_commitment::compress(witness_inputs);

        EXPECT_EQ(result.get_value(), expected);
    }
};

using CircuitTypes = testing::
    Types<proof_system::StandardCircuitBuilder, proof_system::TurboCircuitBuilder, proof_system::UltraCircuitBuilder>;

TYPED_TEST_SUITE(stdlib_pedersen, CircuitTypes);

TYPED_TEST(stdlib_pedersen, small)
{
    TestFixture::test_pedersen();
};

TYPED_TEST(stdlib_pedersen, edge_cases)
{
    TestFixture::test_pedersen_edge_cases();
};

HEAVY_TYPED_TEST(stdlib_pedersen, large)
{
    TestFixture::test_pedersen_large();
};

TYPED_TEST(stdlib_pedersen, compress_byte_array)
{
    TestFixture::test_compress_byte_array();
};

TYPED_TEST(stdlib_pedersen, multi_compress)
{
    TestFixture::test_multi_compress();
};

TYPED_TEST(stdlib_pedersen, compress_eight)
{
    TestFixture::test_compress_eight();
};

TYPED_TEST(stdlib_pedersen, compress_constants)
{
    TestFixture::test_compress_constants();
};

} // namespace test_stdlib_pedersen
