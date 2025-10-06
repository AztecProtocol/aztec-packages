#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"

using namespace cdg;
using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Builder> class BoomerangStdlibPedersen : public testing::Test {
    using _curve = stdlib::bn254<Builder>;

    using byte_array_ct = typename _curve::byte_array_ct;
    using fr_ct = typename _curve::ScalarField;
    using witness_ct = typename _curve::witness_ct;
    using public_witness_ct = typename _curve::public_witness_ct;
    using pedersen_hash = typename stdlib::pedersen_hash<Builder>;

  public:
    static void analyze_circuit(Builder& builder)
    {
        if constexpr (IsMegaBuilder<Builder>) {
            MegaStaticAnalyzer tool = MegaStaticAnalyzer(builder);
            auto res = tool.analyze_circuit();
            auto cc = res.first;
            auto variables_in_one_gate = res.second;
            EXPECT_EQ(cc.size(), 1);
            EXPECT_EQ(variables_in_one_gate.size(), 0);
            if (variables_in_one_gate.size() > 0) {
                auto first_element =
                    std::vector<uint32_t>(variables_in_one_gate.begin(), variables_in_one_gate.end())[0];
                tool.print_variable_info(first_element);
            }
        }
        if constexpr (IsUltraBuilder<Builder>) {
            StaticAnalyzer tool = StaticAnalyzer(builder);
            auto res = tool.analyze_circuit();
            auto cc = res.first;
            auto variables_in_one_gate = res.second;
            EXPECT_EQ(cc.size(), 1);
            EXPECT_EQ(variables_in_one_gate.size(), 0);
            if (variables_in_one_gate.size() > 0) {
                auto first_element =
                    std::vector<uint32_t>(variables_in_one_gate.begin(), variables_in_one_gate.end())[0];
                tool.print_variable_info(first_element);
            }
        }
    }
    static void test_pedersen_two()
    {
        Builder builder;

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();

        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }

        fr_ct left = public_witness_ct(&builder, left_in);
        fr_ct right = witness_ct(&builder, right_in);

        builder.fix_witness(left.witness_index, left.get_value());
        builder.fix_witness(right.witness_index, right.get_value());

        fr_ct out = pedersen_hash::hash({ left, right });
        out.fix_witness();

        analyze_circuit(builder);
    }

    static void test_pedersen_large()
    {
        Builder builder;
        fr left_in = fr::random_element();
        fr right_in = fr::random_element();
        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }
        fr_ct left = witness_ct(&builder, left_in);
        builder.update_used_witnesses(left.witness_index);
        fr_ct right = witness_ct(&builder, right_in);
        for (size_t i = 0; i < 256; ++i) {
            left = pedersen_hash::hash({ left, right });
        }
        left.fix_witness();
        builder.set_public_input(left.witness_index);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
        analyze_circuit(builder);
    }

    static void test_hash_eight()
    {
        Builder builder;

        std::vector<grumpkin::fq> inputs;
        inputs.reserve(8);
        std::vector<stdlib::field_t<Builder>> witness_inputs;

        for (size_t i = 0; i < 8; ++i) {
            inputs.emplace_back(bb::fr::random_element());
            witness_inputs.emplace_back(witness_ct(&builder, inputs[i]));
        }
        std::vector<uint32_t> witness_indices;
        for (auto& wi : witness_inputs) {
            witness_indices.emplace_back(wi.witness_index);
        }
        // In a test we don't have additional constraints except for constraint for splitting inputs on 2 scalars for
        // batch_mul and checking linear_identity. So we can put them into used_witnesses.
        builder.update_used_witnesses(witness_indices);
        constexpr size_t hash_idx = 10;
        auto result = pedersen_hash::hash(witness_inputs, hash_idx);
        result.fix_witness();
        analyze_circuit(builder);
    }

    static void test_multi_hash()
    {
        Builder builder;

        for (size_t i = 0; i < 7; ++i) {
            std::vector<fr> inputs;
            inputs.push_back(bb::fr::random_element());
            inputs.push_back(bb::fr::random_element());
            inputs.push_back(bb::fr::random_element());
            inputs.push_back(bb::fr::random_element());

            if (i == 1) {
                inputs[0] = fr(0);
            }
            if (i == 2) {
                inputs[1] = fr(0);
                inputs[2] = fr(0);
            }
            if (i == 3) {
                inputs[3] = fr(0);
            }
            if (i == 4) {
                inputs[0] = fr(0);
                inputs[3] = fr(0);
            }
            if (i == 5) {
                inputs[0] = fr(0);
                inputs[1] = fr(0);
                inputs[2] = fr(0);
                inputs[3] = fr(0);
            }
            if (i == 6) {
                inputs[1] = fr(1);
            }
            std::vector<fr_ct> witnesses;
            for (auto input : inputs) {
                witnesses.push_back(witness_ct(&builder, input));
            }
            // In a test we don't have additional constraints except for constraint for splitting inputs on 2 scalars
            // for batch_mul and checking linear_identity. So we can put them into used_witnesses.
            for (auto wit : witnesses) {
                builder.update_used_witnesses(wit.witness_index);
            }
            fr_ct result = pedersen_hash::hash(witnesses);
            result.fix_witness();
        }
        analyze_circuit(builder);
    }

    static void test_large_inputs()
    {
        Builder builder;
        std::vector<fr> native_inputs;
        std::vector<fr_ct> witness_inputs;

        constexpr size_t size = 200;
        for (size_t i = 0; i < size; ++i) {
            native_inputs.push_back(fr::random_element());
            witness_inputs.push_back(witness_ct(&builder, native_inputs.back()));
        }
        // In a test we don't have additional constraints except for constraint for splitting inputs on 2 scalars for
        // batch_mul and checking linear_identity. So we can put them into used_witnesses.
        for (auto wi : witness_inputs) {
            builder.update_used_witnesses(wi.witness_index);
        }
        auto result = pedersen_hash::hash(witness_inputs);
        result.fix_witness();
        analyze_circuit(builder);
    }
};

using CircuitTypes = testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;

TYPED_TEST_SUITE(BoomerangStdlibPedersen, CircuitTypes);

TYPED_TEST(BoomerangStdlibPedersen, Small)
{
    TestFixture::test_pedersen_two();
}

TYPED_TEST(BoomerangStdlibPedersen, Large)
{
    TestFixture::test_pedersen_large();
}

TYPED_TEST(BoomerangStdlibPedersen, HashEight)
{
    TestFixture::test_hash_eight();
}

TYPED_TEST(BoomerangStdlibPedersen, TestLargeInputs)
{
    TestFixture::test_large_inputs();
}

TYPED_TEST(BoomerangStdlibPedersen, TestMultiHash)
{
    TestFixture::test_multi_hash();
}
