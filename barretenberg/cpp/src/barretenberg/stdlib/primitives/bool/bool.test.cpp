#include "bool.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>
#include <tuple>

#define STDLIB_TYPE_ALIASES                                                                                            \
    using Builder = TypeParam;                                                                                         \
    using witness_ct = stdlib::witness_t<Builder>;                                                                     \
    using bool_ct = stdlib::bool_t<Builder>;

using namespace bb;

#pragma GCC diagnostic ignored "-Wunused-const-variable"

namespace {
auto& engine = numeric::get_debug_randomness();
}
STANDARD_TESTING_TAGS
template <class Builder_> class BoolTest : public ::testing::Test {
  public:
    using Builder = Builder_;
    using witness_ct = stdlib::witness_t<Builder>;
    using bool_ct = stdlib::bool_t<Builder>;

    // These tree boolean flags cover all possible combinations for a valid input.
    struct BoolInput {
        bool is_const;    // witness_index = IS_CONSTANT
        bool value;       // w_a
        bool is_inverted; // i_a
    };

    // A helper to produce all possible inputs for a given operand.
    std::array<BoolInput, 8> all_inputs = []() {
        std::array<BoolInput, 8> inputs{};
        size_t idx = 0;
        for (bool is_const : { false, true }) {
            for (bool value : { false, true }) {
                for (bool is_inverted : { false, true }) {
                    inputs[idx++] = BoolInput{ is_const, value, is_inverted };
                }
            }
        }
        return inputs;
    }();
    // A helper to create a bool_t element from the given flags
    static bool_ct create_bool_ct(const BoolInput& in, Builder* builder)
    {
        bool_ct b = in.is_const ? bool_ct(in.value) : witness_ct(builder, in.value);
        return in.is_inverted ? !b : b;
    };

    void test_binary_op(std::string const& op_name,
                        const std::function<bool_ct(const bool_ct&, const bool_ct&)>& op,
                        const std::function<bool(bool, bool)>& expected_op)
    {
        Builder builder;

        for (auto& lhs : all_inputs) {
            for (auto& rhs : all_inputs) {
                bool_ct a = create_bool_ct(lhs, &builder);
                bool_ct b = create_bool_ct(rhs, &builder);

                size_t num_gates_start = builder.get_estimated_num_finalized_gates();

                if (!a.is_constant() && !b.is_constant()) {
                    a.set_origin_tag(submitted_value_origin_tag);
                    b.set_origin_tag(challenge_origin_tag);
                }
                bool_ct c = op(a, b);

                bool expected = expected_op(lhs.value ^ lhs.is_inverted, rhs.value ^ rhs.is_inverted);

                EXPECT_EQ(c.get_value(), expected)
                    << "Failed on " << op_name << " with inputs: lhs = {const=" << lhs.is_const << ", val=" << lhs.value
                    << ", inv=" << lhs.is_inverted << "}, rhs = {const=" << rhs.is_const << ", val=" << rhs.value
                    << ", inv=" << rhs.is_inverted << "}";

                if (a.is_constant() && b.is_constant()) {
                    EXPECT_TRUE(c.is_constant());
                }

                if (!a.is_constant() && !b.is_constant()) {
                    // The result of a binary op on two witnesses must be a witness
                    EXPECT_TRUE(!c.is_constant());
                    // Check that the tags are propagated
                    EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
                }

                size_t diff = builder.get_estimated_num_finalized_gates() - num_gates_start;
                // An extra gate is created iff both operands are witnesses
                EXPECT_EQ(diff, static_cast<size_t>(!a.is_constant() && !b.is_constant()));
            }
        }

        EXPECT_TRUE(CircuitChecker::check(builder));
    };

    void test_construct_from_const_bool()
    {
        Builder builder = Builder();
        size_t num_gates_start = builder.get_estimated_num_finalized_gates();
        bool_ct a_true(true);
        bool_ct a_false(false);
        EXPECT_TRUE(a_true.get_value());
        EXPECT_FALSE(a_false.get_value());
        EXPECT_TRUE(a_true.is_constant() && a_false.is_constant());
        EXPECT_TRUE(!a_true.witness_inverted && !a_false.witness_inverted);
        // No gates have been added
        EXPECT_TRUE(num_gates_start == builder.get_estimated_num_finalized_gates());
    }

    void test_construct_from_witness()
    {
        Builder builder = Builder();
        size_t num_gates_start = builder.get_estimated_num_finalized_gates();

        bool_ct a_true = witness_ct(&builder, 1);
        bool_ct a_false = witness_ct(&builder, 0);
        EXPECT_TRUE(a_true.get_value());
        EXPECT_FALSE(a_false.get_value());
        EXPECT_TRUE(!a_true.is_constant() && !a_false.is_constant());
        EXPECT_TRUE(!a_true.witness_inverted && !a_false.witness_inverted);
        // Each witness bool must be constrained => expect 2 gates being added
        EXPECT_TRUE(builder.get_estimated_num_finalized_gates() - num_gates_start == 2);
        EXPECT_TRUE(CircuitChecker::check(builder));

#ifndef NDEBUG
        // Test failure
        bool_ct a_incorrect;
        uint256_t random_value(engine.get_random_uint256());

        if (random_value * random_value - random_value != 0) {
            EXPECT_DEATH(a_incorrect = witness_ct(&builder, random_value),
                         "((other.witness == bb::fr::one()) || (other.witness == bb::fr::zero()))");
        };
#endif
    }
    void test_AND()
    {
        test_binary_op(
            "AND", [](const bool_ct& a, const bool_ct& b) { return a & b; }, [](bool a, bool b) { return a && b; });
    }

    void test_xor()
    {
        test_binary_op(
            "XOR", [](const bool_ct& a, const bool_ct& b) { return a ^ b; }, [](bool a, bool b) { return a ^ b; });
    }

    void test_OR()
    {
        test_binary_op(
            "OR", [](const bool_ct& a, const bool_ct& b) { return a || b; }, [](bool a, bool b) { return a || b; });
    }

    void test_EQ()
    {
        test_binary_op(
            "==", [](const bool_ct& a, const bool_ct& b) { return a == b; }, [](bool a, bool b) { return a == b; });
    }

    void test_NEQ()
    {
        test_binary_op(
            "==", [](const bool_ct& a, const bool_ct& b) { return a != b; }, [](bool a, bool b) { return a != b; });
    }

    void test_implies()
    {
        test_binary_op(
            "=>",
            [](const bool_ct& a, const bool_ct& b) { return a.implies(b); },
            [](bool a, bool b) { return !a || b; });
    }

    void test_implies_both_ways()
    {
        test_binary_op(
            "<=>",
            [](const bool_ct& a, const bool_ct& b) { return a.implies_both_ways(b); },
            [](bool a, bool b) { return !a ^ b; });
    }

    void test_must_imply()
    {

        for (auto& lhs : all_inputs) {
            for (auto& rhs : all_inputs) {
                Builder builder;

                bool_ct a = create_bool_ct(lhs, &builder);
                bool_ct b = create_bool_ct(rhs, &builder);

                if (a.is_constant() && b.is_constant() && !(!a.get_value() || b.get_value())) {
#ifndef NDEBUG
                    EXPECT_DEATH(a.must_imply(b), R"(\(lhs\.get_value\(\) == rhs\.get_value\(\)\))");
#endif
                } else {
                    bool result_is_constant = (!a || b).is_constant();

                    size_t num_gates_start = builder.get_estimated_num_finalized_gates();

                    if (!a.is_constant() && !b.is_constant()) {
                        a.set_origin_tag(submitted_value_origin_tag);
                        b.set_origin_tag(challenge_origin_tag);
                    }
                    a.must_imply(b);
                    // !a || b
                    // b = 1 =>
                    bool expected = !(lhs.value ^ lhs.is_inverted) || rhs.value ^ rhs.is_inverted;

                    size_t diff = builder.get_estimated_num_finalized_gates() - num_gates_start;

                    if (!a.is_constant() && !b.is_constant()) {
                        EXPECT_EQ(diff, 2);
                    }
                    // Due to optimizations, the result of a => b can be a constant, in this case, the the assert_equal
                    // reduces to an out-of-circuit ASSERT
                    if (result_is_constant) {
                        EXPECT_EQ(diff, 0);
                    }

                    if (!result_is_constant && a.is_constant() && !b.is_constant()) {
                        // we only add gates if the value `true` is not flipped to `false` and we need to add a new
                        // constant == 1, which happens iff `b` is not inverted.
                        EXPECT_EQ(diff, static_cast<size_t>(!b.witness_inverted));
                    }

                    if (!result_is_constant && !a.is_constant() && b.is_constant()) {
                        // we only add gates if the value `true` is not flipped to `false` and we need to add a new
                        // constant == 1, which happens iff `a` is inverted.
                        EXPECT_EQ(diff, static_cast<size_t>(a.witness_inverted));
                    }
                    EXPECT_EQ(CircuitChecker::check(builder), expected);
                }
            }
        }
    }

    void test_conditional_assign()
    {
        for (auto lhs : all_inputs) {
            for (auto rhs : all_inputs) {
                for (auto predicate : all_inputs) {
                    Builder builder;

                    bool_ct a = create_bool_ct(lhs, &builder);
                    bool_ct b = create_bool_ct(rhs, &builder);
                    bool_ct condition = create_bool_ct(predicate, &builder);

                    size_t num_gates_start = builder.get_estimated_num_finalized_gates();
                    if (!a.is_constant() && !b.is_constant()) {
                        condition.set_origin_tag(submitted_value_origin_tag);
                        a.set_origin_tag(challenge_origin_tag);
                        b.set_origin_tag(next_challenge_tag);
                    }

                    bool_ct result = bool_ct::conditional_assign(condition, a, b);
                    size_t diff = builder.get_estimated_num_finalized_gates() - num_gates_start;
                    if (!a.is_constant() && !b.is_constant()) {
                        EXPECT_EQ(result.get_origin_tag(), first_second_third_merged_tag);
                    }
                    bool expected = (condition.get_value()) ? a.get_value() : b.get_value();
                    EXPECT_EQ(result.get_value(), expected);

                    if (condition.is_constant()) {
                        EXPECT_EQ(diff, 0);
                    }
                }
            }
        }
    }
    void test_normalize()
    {
        for (auto a_raw : all_inputs) {
            auto builder = Builder();

            bool_ct a = create_bool_ct(a_raw, &builder);

            size_t num_gates_start = builder.get_estimated_num_finalized_gates();
            if (!a.is_constant()) {
                a.set_origin_tag(submitted_value_origin_tag);
            }
            bool_ct c = a.normalize();
            EXPECT_EQ(c.get_value(), a.get_value());
            if (!a.is_constant()) {
                EXPECT_EQ(c.get_origin_tag(), submitted_value_origin_tag);
            }
            EXPECT_EQ(c.witness_inverted, false);
            size_t diff = builder.get_estimated_num_finalized_gates() - num_gates_start;
            // Note that although `normalize()` returns value, it flips the `witness_inverted` flag of `a` if it was
            // `true`.
            EXPECT_EQ(diff, static_cast<size_t>(!a.is_constant() && a_raw.is_inverted));
            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    }

    void test_basic_operations_tags()
    {
        auto builder = Builder();

        auto gates_before = builder.get_estimated_num_finalized_gates();

        bool_ct a = witness_ct(&builder, bb::fr::one());
        bool_ct b = witness_ct(&builder, bb::fr::zero());

        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        a = a ^ b; // a = 1
        EXPECT_EQ(a.get_value(), 1);

        // Tags are merged on XOR
        EXPECT_EQ(a.get_origin_tag(), first_two_merged_tag);

        b = !b; // b = 1 (witness 0)
        EXPECT_EQ(b.get_value(), 1);

        // Tag is preserved on NOT
        EXPECT_EQ(b.get_origin_tag(), challenge_origin_tag);

        a.set_origin_tag(submitted_value_origin_tag);

        bool_ct d = (a == b); //
        EXPECT_EQ(d.get_value(), 1);

        // Tags are merged on ==
        EXPECT_EQ(d.get_origin_tag(), first_two_merged_tag);

        d = false; // d = 0
        d.set_origin_tag(challenge_origin_tag);
        EXPECT_EQ(d.get_value(), 0);

        bool_ct e = a | d; // e = 1 = a
        EXPECT_EQ(e.get_value(), 1);

        // Tags are merged on OR
        EXPECT_EQ(e.get_origin_tag(), first_two_merged_tag);

        bool_ct f = e ^ b; // f = 0
        EXPECT_EQ(f.get_value(), 0);

        f.set_origin_tag(challenge_origin_tag);
        d = (!f) & a; // d = 1
        EXPECT_EQ(d.get_value(), 1);

        // Tags are merged on AND
        EXPECT_EQ(d.get_origin_tag(), first_two_merged_tag);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);

        auto gates_after = builder.get_estimated_num_finalized_gates();
        EXPECT_EQ(gates_after - gates_before, 6UL);
    }
};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder>;

TYPED_TEST_SUITE(BoolTest, CircuitTypes);
TYPED_TEST(BoolTest, ConstructFromConstBool)
{
    TestFixture::test_construct_from_const_bool();
}

TYPED_TEST(BoolTest, ConstructFromWitness)
{
    TestFixture::test_construct_from_witness();
}

TYPED_TEST(BoolTest, Normalization)
{
    TestFixture::test_normalize();
}
TYPED_TEST(BoolTest, XOR)
{
    TestFixture::test_xor();
}

TYPED_TEST(BoolTest, AND)
{
    TestFixture::test_AND();
}

TYPED_TEST(BoolTest, OR)
{
    TestFixture::test_OR();
}

TYPED_TEST(BoolTest, EQ)
{
    TestFixture::test_EQ();
}

TYPED_TEST(BoolTest, NEQ)
{
    TestFixture::test_NEQ();
}

TYPED_TEST(BoolTest, Implies)
{
    TestFixture::test_implies();
}

TYPED_TEST(BoolTest, ImpliesBothWays)
{
    TestFixture::test_implies_both_ways();
}

TYPED_TEST(BoolTest, MustImply)
{
    TestFixture::test_must_imply();
}

TYPED_TEST(BoolTest, ConditionalAssign)
{
    TestFixture::test_conditional_assign();
}

TYPED_TEST(BoolTest, TestBasicOperationsTags)
{

    TestFixture::test_basic_operations_tags();
}

TYPED_TEST(BoolTest, Eq)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    bool a_alt[32];
    bool b_alt[32];
    bool c_alt[32];
    bool d_alt[32];
    for (size_t i = 0; i < 32; ++i) {
        if (i % 2 == 0) {
            a_alt[i] = bool(i % 2);
            b_alt[i] = false;
            c_alt[i] = a_alt[i] ^ b_alt[i];
            d_alt[i] = a_alt[i] == c_alt[i];
        } else {
            a_alt[i] = true;
            b_alt[i] = false;
            c_alt[i] = false;
            d_alt[i] = false;
        }
    }
    bool_ct a[32];
    bool_ct b[32];
    bool_ct c[32];
    bool_ct d[32];
    for (size_t i = 0; i < 32; ++i) {
        if (i % 2 == 0) {
            a[i] = witness_ct(&builder, (bool)(i % 2));
            b[i] = witness_ct(&builder, (bool)(0));
            c[i] = a[i] ^ b[i];
            d[i] = a[i] == c[i];
        } else {
            a[i] = witness_ct(&builder, (bool)(1));
            b[i] = witness_ct(&builder, (bool)(0));
            c[i] = a[i] & b[i];
            d[i] = a[i] == c[i];
        }
    }
    for (size_t i = 0; i < 32; ++i) {
        EXPECT_EQ(a[i].get_value(), a_alt[i]);
        EXPECT_EQ(b[i].get_value(), b_alt[i]);
        EXPECT_EQ(c[i].get_value(), c_alt[i]);
        EXPECT_EQ(d[i].get_value(), d_alt[i]);
    }

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TYPED_TEST(BoolTest, TestSimpleProof)
{
    STDLIB_TYPE_ALIASES
    Builder builder;

    bool_ct a = witness_ct(&builder, bb::fr::one());
    bool_ct b = witness_ct(&builder, bb::fr::zero());
    a = a ^ b;            // a = 1
    b = !b;               // b = 1 (witness 0)
    bool_ct c = (a == b); // c = 1
    bool_ct d(&builder);  // d = ?
    d = false;            // d = 0
    bool_ct e = a | d;    // e = 1 = a
    bool_ct f = e ^ b;    // f = 0
    d = (!f) & a;         // d = 1
    for (size_t i = 0; i < 64; ++i) {
        a = witness_ct(&builder, (bool)(i % 2));
        b = witness_ct(&builder, (bool)(i % 3 == 1));
        c = a ^ b;
        a = b ^ c;
        c = a;
        a = b;
        f = b;
    }

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}
