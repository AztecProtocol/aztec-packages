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

TYPED_TEST(BoolTest, TestBasicOperationsTags)
{

    STDLIB_TYPE_ALIASES
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

TYPED_TEST(BoolTest, XorTwinConstants)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    bool_ct c;
    for (size_t i = 0; i < 32; ++i) {
        bool_ct a(&builder, (i % 1) == 0);
        bool_ct b(&builder, (i % 1) == 1);
        c = c ^ a ^ b;
    }
    c = c ^ bool_ct(witness_ct(&builder, true));
    for (size_t i = 0; i < 32; ++i) {
        if (i % 2 == 0) {
            bool_ct a = witness_ct(&builder, (bool)(i % 2));
            bool_ct b(&builder, (bool)(i % 3 == 1));
            c = c ^ a ^ b;
        } else {
            bool_ct a(&builder, (bool)(i % 2));
            bool_ct b = witness_ct(&builder, (bool)(i % 3 == 1));
            c = c ^ a ^ b;
        }
    }

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
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

TYPED_TEST(BoolTest, MustImplyMultiple)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    /**
     * Define g(x) = 2x + 12
     * if x is divisible by both 4 and 6:
     *     => g(x) > 0
     *     => g(x) is even
     *     => g(x) >= 12
     *     => g(x) is a multiple of 6
     */
    auto g = [](size_t x) { return 2 * x + 12; };

    for (size_t j = 0; j < 3; ++j) { // ignore when both lhs and rhs are constants
        bool lhs_constant = (bool)(j % 2);
        bool rhs_constant = (bool)(j > 1 ? true : false);

        for (size_t x = 10; x < 18; x += 2) {
            std::vector<std::pair<bool_ct, std::string>> conditions;
            bool four = (bool)(x % 4 == 0);
            bool six = (bool)(x % 6 == 0);

            bool_ct a = lhs_constant ? bool_ct(four) : (witness_ct(&builder, four));
            bool_ct b = rhs_constant ? bool_ct(six) : (witness_ct(&builder, six));

            auto g_x = g(x);
            conditions.push_back(std::make_pair(g_x > 0, "g(x) > 0"));
            conditions.push_back(std::make_pair(g_x % 2 == 0, "g(x) is even"));
            conditions.push_back(std::make_pair(g_x >= 12, "g(x) >= 12"));
            conditions.push_back(std::make_pair(g_x % 6 == 0, "g(x) is a multiple of 6"));

            (a && b).must_imply(conditions);

            if (builder.failed()) {
                EXPECT_EQ(builder.err(), "multi implication fail: g(x) is a multiple of 6");
            } else {
                bool result = CircuitChecker::check(builder);
                EXPECT_EQ(result, true);
            }
        }
    }
}

TYPED_TEST(BoolTest, MustImplyMultipleFails)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    /**
     * Given x = 15:
     * (x > 10)
     *  => (x > 8)
     *  => (x > 5)
     *  ≠> (x > 18)
     */
    for (size_t j = 0; j < 2; ++j) { // ignore when both lhs and rhs are constants
        bool is_constant = (bool)(j % 2);

        size_t x = 15;
        bool main = (bool)(x > 10);
        bool_ct main_ct = is_constant ? bool_ct(main) : (witness_ct(&builder, main));

        std::vector<std::pair<bool_ct, std::string>> conditions;
        conditions.push_back(std::make_pair(witness_ct(&builder, x > 8), "x > 8"));
        conditions.push_back(std::make_pair(witness_ct(&builder, x > 5), "x > 5"));
        conditions.push_back(std::make_pair(witness_ct(&builder, x > 18), "x > 18"));

        main_ct.must_imply(conditions);

        EXPECT_EQ(builder.failed(), true);
        EXPECT_EQ(builder.err(), "multi implication fail: x > 18");
    }
}

TYPED_TEST(BoolTest, ConditionalAssign)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    for (size_t j = 0; j < 4; ++j) {
        bool lhs_constant = (bool)(j % 2);
        bool rhs_constant = (bool)(j > 1 ? true : false);

        const uint256_t x = (uint256_t(1) << 128) - 1;
        const uint256_t val = engine.get_random_uint256();

        bool condition = (val % 2 == 0);
        bool right = x < val;
        bool left = x > val;
        bool_ct l_ct = lhs_constant ? bool_ct(left) : (witness_ct(&builder, left));
        bool_ct r_ct = rhs_constant ? bool_ct(right) : (witness_ct(&builder, right));
        bool_ct cond = (witness_ct(&builder, condition));

        if (!(lhs_constant | rhs_constant)) {
            cond.set_origin_tag(submitted_value_origin_tag);
            l_ct.set_origin_tag(challenge_origin_tag);
            r_ct.set_origin_tag(next_challenge_tag);
        }
        auto result = bool_ct::conditional_assign(cond, l_ct, r_ct);

        if (!(lhs_constant | rhs_constant)) {
            // Tags are merged on conditional assign
            EXPECT_EQ(result.get_origin_tag(), first_second_third_merged_tag);
        }

        EXPECT_EQ(result.get_value(), condition ? left : right);
    }
    info("num gates = ", builder.get_estimated_num_finalized_gates());
    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}

TYPED_TEST(BoolTest, TestSimpleProof)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    bool_ct a(&builder);
    bool_ct b(&builder);
    a = witness_ct(&builder, bb::fr::one());
    b = witness_ct(&builder, bb::fr::zero());
    // bool_ct c(&builder);
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

TYPED_TEST(BoolTest, Normalize)
{
    STDLIB_TYPE_ALIASES
    auto builder = Builder();

    auto generate_constraints = [&builder](bool value, bool is_constant, bool is_inverted) {
        bool_ct a = is_constant ? bool_ct(&builder, value) : witness_ct(&builder, value);
        bool_ct b = is_inverted ? !a : a;
        if (!is_constant) {
            b.set_origin_tag(submitted_value_origin_tag);
        }
        bool_ct c = b.normalize();
        EXPECT_EQ(c.get_value(), value ^ is_inverted);
        if (!is_constant) {
            EXPECT_EQ(c.get_origin_tag(), submitted_value_origin_tag);
        }
    };

    generate_constraints(false, false, false);
    generate_constraints(false, false, true);
    generate_constraints(false, true, false);
    generate_constraints(false, true, true);
    generate_constraints(true, false, false);
    generate_constraints(true, false, true);
    generate_constraints(true, true, false);
    generate_constraints(true, true, true);

    bool result = CircuitChecker::check(builder);
    EXPECT_EQ(result, true);
}
