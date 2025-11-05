#include "bool.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>
#include <tuple>

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

                size_t num_gates_start = builder.get_num_finalized_gates_inefficient();

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

                size_t diff = builder.get_num_finalized_gates_inefficient() - num_gates_start;
                // An extra gate is created iff both operands are witnesses
                EXPECT_EQ(diff, static_cast<size_t>(!a.is_constant() && !b.is_constant()));
            }
        }

        EXPECT_TRUE(CircuitChecker::check(builder));
    };

    void test_construct_from_const_bool()
    {
        Builder builder = Builder();
        size_t num_gates_start = builder.get_num_finalized_gates_inefficient();
        bool_ct a_true(true);
        bool_ct a_false(false);
        EXPECT_TRUE(a_true.get_value());
        EXPECT_FALSE(a_false.get_value());
        EXPECT_TRUE(a_true.is_constant() && a_false.is_constant());
        EXPECT_TRUE(!a_true.is_inverted() && !a_false.is_inverted());
        // No gates have been added
        EXPECT_TRUE(num_gates_start == builder.get_num_finalized_gates_inefficient());
    }

    void test_construct_from_witness_index()
    {
        Builder builder = Builder();
        size_t num_gates_start = builder.get_num_finalized_gates_inefficient();
        const size_t witness_idx_zero = builder.add_variable(bb::fr(0));
        const size_t witness_idx_one = builder.add_variable(bb::fr(1));
        const size_t non_bool_witness_idx = builder.add_variable(bb::fr(15));

        bool_ct bool_witness = bool_ct::from_witness_index_unsafe(&builder, witness_idx_zero);
        EXPECT_EQ(bool_witness.get_value(), false);

        bool_witness = bool_ct::from_witness_index_unsafe(&builder, witness_idx_one);
        EXPECT_EQ(bool_witness.get_value(), true);
        // No gates are added.
        EXPECT_EQ(builder.get_num_finalized_gates_inefficient() - num_gates_start, 0);

        // Out-of-circuit failure when witness points to a non-bool value.
        EXPECT_THROW_OR_ABORT(bool_witness = bool_ct::from_witness_index_unsafe(&builder, non_bool_witness_idx),
                              "bool_t: creating a witness bool from a non-boolean value");
    }
    void test_construct_from_witness()
    {
        Builder builder = Builder();
        size_t num_gates_start = builder.get_num_finalized_gates_inefficient();

        bool_ct a_true = witness_ct(&builder, 1);
        bool_ct a_false = witness_ct(&builder, 0);
        EXPECT_TRUE(a_true.get_value());
        EXPECT_FALSE(a_false.get_value());
        EXPECT_TRUE(!a_true.is_constant() && !a_false.is_constant());
        EXPECT_TRUE(!a_true.is_inverted() && !a_false.is_inverted());
        // Each witness bool must be constrained => expect 2 gates being added
        EXPECT_TRUE(builder.get_num_finalized_gates_inefficient() - num_gates_start == 2);
        EXPECT_TRUE(CircuitChecker::check(builder));

        // Test failure
        bool_ct a_incorrect;
        uint256_t random_value(engine.get_random_uint256());

        if (random_value * random_value - random_value != 0) {
            EXPECT_THROW_OR_ABORT(a_incorrect = witness_ct(&builder, random_value),
                                  "((other.witness == bb::fr::one()) || (other.witness == bb::fr::zero()))");
        };
    }

    void test_construct_from_witness_range_constraint()
    {
        const bool use_range_constraint = true;

        for (size_t num_inputs = 1; num_inputs < 50; num_inputs++) {
            Builder builder = Builder();
            size_t num_gates_start = builder.get_num_finalized_gates_inefficient();

            std::vector<uint32_t> indices;
            for (size_t idx = 0; idx < num_inputs; idx++) {
                indices.push_back(bool_ct(witness_ct(&builder, idx % 2), use_range_constraint).get_witness_index());
            }

            // Note: +2 comes from entries added in create_range_list for target_range == 1
            size_t sorted_list_size = num_inputs + 2;
            // sorted list is padded to minimum size of 8
            sorted_list_size = std::max(sorted_list_size, 8UL);
            // +4 for combination of unconstrained gates and add gates for fixing endpoints
            size_t fixed_additional_gates = 4;
            // Delta-range mechanism packs 4 values per gate
            size_t expected = numeric::ceil_div(sorted_list_size, 4UL) + fixed_additional_gates;

            size_t actual = builder.get_num_finalized_gates_inefficient() - num_gates_start;

            EXPECT_EQ(actual, expected);

            builder.create_unconstrained_gates(indices);

            EXPECT_TRUE(CircuitChecker::check(builder));
        }

        // Failure test
        Builder builder = Builder();
        EXPECT_THROW_OR_ABORT(auto new_bool = bool_ct(witness_ct(&builder, 2), use_range_constraint),
                              "bool_t: witness value is not 0 or 1");
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
            "!=", [](const bool_ct& a, const bool_ct& b) { return a != b; }, [](bool a, bool b) { return a != b; });
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
            [](bool a, bool b) { return !(a ^ b); });
    }

    void test_must_imply()
    {

        for (auto& lhs : all_inputs) {
            for (auto& rhs : all_inputs) {
                Builder builder;

                bool_ct a = create_bool_ct(lhs, &builder);
                bool_ct b = create_bool_ct(rhs, &builder);

                if (a.is_constant() && b.is_constant() && !(!a.get_value() || b.get_value())) {
                    EXPECT_THROW_OR_ABORT(a.must_imply(b), R"(\(lhs\.get_value\(\) == rhs\.get_value\(\)\))");
                } else {
                    bool result_is_constant = (!a || b).is_constant();

                    size_t num_gates_start = builder.get_num_finalized_gates_inefficient();

                    if (!a.is_constant() && !b.is_constant()) {
                        a.set_origin_tag(submitted_value_origin_tag);
                        b.set_origin_tag(challenge_origin_tag);
                    }
                    a.must_imply(b);
                    // !a || b
                    // b = 1 =>
                    bool expected = !(lhs.value ^ lhs.is_inverted) || rhs.value ^ rhs.is_inverted;

                    size_t diff = builder.get_num_finalized_gates_inefficient() - num_gates_start;

                    if (!a.is_constant() && !b.is_constant()) {
                        EXPECT_EQ(diff, 1);
                    }
                    // Due to optimizations, the result of a => b can be a constant, in this case, the the assert_equal
                    // reduces to an out-of-circuit ASSERT
                    if (result_is_constant) {
                        EXPECT_EQ(diff, 0);
                    }

                    // No gates are added when one operand is constant
                    if (!result_is_constant && a.is_constant() && !b.is_constant()) {
                        EXPECT_EQ(diff, 0);
                    }

                    if (!result_is_constant && !a.is_constant() && b.is_constant()) {
                        EXPECT_EQ(diff, 0);
                    }
                    EXPECT_EQ(CircuitChecker::check(builder), expected);
                }
            }
        }
    }

    // Helper to compute expected gate count for conditional_assign
    static size_t compute_conditional_assign_gates(
        const bool_ct& condition, const bool_ct& a, const bool_ct& b, const BoolInput& lhs, const BoolInput& rhs)
    {
        if (condition.is_constant()) {
            // Branch 1: Constant predicate - select lhs or rhs, then normalize
            // Adds 1 gate only if selected value is inverted
            bool_ct selected = condition.get_value() ? a : b;
            return (selected.is_inverted()) ? 1 : 0;
        }

        // Check for Branch 2: same witness (both constants with same value)
        if (a.is_constant() && b.is_constant() && a.get_value() == b.get_value()) {
            // Branch 2: Same witness - return lhs.normalize()
            // Adds 1 gate only if lhs is inverted
            return (a.is_inverted()) ? 1 : 0;
        }

        // Branch 3: (predicate && lhs) || (!predicate && rhs), then normalize
        // Key insight: OR of two witnesses creates a NEW normalized witness (no normalization gate needed)
        // But OR of witness and constant may return the witness directly (may need normalization)

        if (!a.is_constant() && !b.is_constant()) {
            // All witnesses: AND + AND + OR = 3 gates
            // OR creates new normalized witness, so normalize() is no-op
            return 3;
        } else if (!a.is_constant()) {
            // lhs witness, rhs constant
            // predicate && lhs: 1 gate (creates new witness)
            // !predicate && rhs:
            //   - if rhs true: returns !predicate (inverted witness if pred was inverted)
            //   - if rhs false: returns false (constant)
            // OR:
            //   - if rhs false: OR(new_witness, const_false) returns new_witness (no gate, already norm)
            //   - if rhs true: OR(new_witness, inverted_witness) adds 1 gate, creates new normalized witness
            return b.get_value() ? 2 : 1;
        } else if (!b.is_constant()) {
            // lhs constant, rhs witness
            // !predicate && rhs: 1 gate (creates new witness)
            // predicate && lhs:
            //   - if lhs true: returns predicate (inverted witness if pred was inverted)
            //   - if lhs false: returns false (constant)
            // OR:
            //   - if lhs false: OR(const_false, new_witness) returns new_witness (no gate, already norm)
            //   - if lhs true: OR(inverted_witness, new_witness) adds 1 gate, creates new normalized witness
            return a.get_value() ? 2 : 1;
        } else {
            // Both constants: fully optimized
            // Result is predicate, !predicate, or constant - may need normalization
            if (lhs.value == rhs.value) {
                // conditional_assign(pred, T, T) = T or conditional_assign(pred, F, F) = F (constant)
                return 0;
            } else if (lhs.value) {
                // conditional_assign(pred, T, F) = pred
                // Result is predicate (inverted if pred is inverted)
                // Normalize adds 1 gate if predicate is inverted
                return condition.is_inverted() ? 1 : 0;
            } else {
                // conditional_assign(pred, F, T) = !pred
                // Result is !predicate (inverted if pred is NOT inverted)
                // Normalize adds 1 gate if predicate is NOT inverted
                return condition.is_inverted() ? 0 : 1;
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

                    size_t num_gates_start = builder.get_num_finalized_gates_inefficient();
                    if (!a.is_constant() && !b.is_constant()) {
                        condition.set_origin_tag(submitted_value_origin_tag);
                        a.set_origin_tag(challenge_origin_tag);
                        b.set_origin_tag(next_challenge_tag);
                    }

                    bool_ct result = bool_ct::conditional_assign(condition, a, b);
                    size_t diff = builder.get_num_finalized_gates_inefficient() - num_gates_start;
                    if (!a.is_constant() && !b.is_constant()) {
                        EXPECT_EQ(result.get_origin_tag(), first_second_third_merged_tag);
                    }

                    // Verify correctness
                    bool expected = (condition.get_value()) ? a.get_value() : b.get_value();
                    EXPECT_EQ(result.get_value(), expected);

                    // Verify result is always normalized
                    EXPECT_FALSE(result.is_inverted());

                    // Pin down gate count for simple cases we can predict
                    if (condition.is_constant() ||
                        (a.is_constant() && b.is_constant() && a.get_value() == b.get_value())) {
                        // Branches 1 & 2: Predictable gate counts
                        size_t expected_gates = compute_conditional_assign_gates(condition, a, b, lhs, rhs);
                        EXPECT_EQ(diff, expected_gates);
                    } else if (!a.is_constant() && !b.is_constant()) {
                        // Branch 3, all witnesses: Always 3 gates (AND + AND + OR)
                        EXPECT_EQ(diff, 3UL);
                    }
                    // For mixed witness/constant cases in branch 3, gate count depends on complex
                    // boolean operator optimizations - we verify normalization instead

                    EXPECT_TRUE(CircuitChecker::check(builder));
                }
            }
        }
    }

    void test_normalize()
    {
        for (auto a_raw : all_inputs) {
            auto builder = Builder();

            bool_ct a = create_bool_ct(a_raw, &builder);

            size_t num_gates_start = builder.get_num_finalized_gates_inefficient();
            if (!a.is_constant()) {
                a.set_origin_tag(submitted_value_origin_tag);
            }
            bool_ct c = a.normalize();
            EXPECT_EQ(c.get_value(), a.get_value());
            if (!a.is_constant()) {
                EXPECT_EQ(c.get_origin_tag(), submitted_value_origin_tag);
            }
            EXPECT_EQ(c.is_inverted(), false);
            size_t diff = builder.get_num_finalized_gates_inefficient() - num_gates_start;
            // Note that although `normalize()` returns value, it flips the `is_inverted()` flag of `a` if it was
            // `true`.
            EXPECT_EQ(diff, static_cast<size_t>(!a.is_constant() && a_raw.is_inverted));
            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    }

    void test_assert_equal()
    {

        for (auto lhs : all_inputs) {
            for (auto rhs : all_inputs) {

                Builder builder;

                bool_ct a = create_bool_ct(lhs, &builder);
                bool_ct b = create_bool_ct(rhs, &builder);

                bool failed = a.get_value() != b.get_value();

                if (!a.is_constant() && !b.is_constant()) {
                    a.assert_equal(b);
                    // CircuitChecker is not verifying the permutation relation
                    EXPECT_EQ(builder.failed(), failed);
                } else if (!a.is_constant() || !b.is_constant()) {
                    a.assert_equal(b);
                    EXPECT_EQ(CircuitChecker::check(builder), !failed);
                } else {
                    if (failed) {
                        EXPECT_THROW_OR_ABORT(a.assert_equal(b), R"(\(lhs\.get_value\(\) == rhs\.get_value\(\)\))");
                    }
                }
            }
        }
    }

    void test_basic_operations_tags()
    {
        auto builder = Builder();

        auto gates_before = builder.get_num_finalized_gates_inefficient();

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

        auto gates_after = builder.get_num_finalized_gates_inefficient();
        EXPECT_EQ(gates_after - gates_before, 6UL);
    }

    // Check that (a && (b || c)) ^ (d => f) <=> ((a && b) || (a && c)) ^ (!d || f)) for all inputs.
    void test_simple_proof()
    {
        for (const auto& a_input : all_inputs) {
            for (const auto& b_input : all_inputs) {
                for (const auto& c_input : all_inputs) {
                    for (const auto& d_input : all_inputs) {
                        for (const auto& f_input : all_inputs) {
                            Builder builder;

                            // Construct bool_cts from inputs
                            bool_ct a = create_bool_ct(a_input, &builder);
                            bool_ct b = create_bool_ct(b_input, &builder);
                            bool_ct c = create_bool_ct(c_input, &builder);
                            bool_ct d = create_bool_ct(d_input, &builder);
                            bool_ct f = create_bool_ct(f_input, &builder);

                            // === Formula 1 ===
                            bool_ct lhs = (a && (b || c)) ^ (d.implies(f));
                            bool_ct rhs = ((a && b) || (a && c)) ^ (!d || f);

                            // Equivalence check
                            bool_ct equivalent = lhs.implies_both_ways(rhs);
                            if (!equivalent.get_value()) {
                                info("FAIL:");
                                info("a: ", a.get_value(), " b: ", b.get_value(), " c: ", c.get_value());
                                info("d: ", d.get_value(), " f: ", f.get_value());
                            }

                            EXPECT_EQ(equivalent.get_value(), true);
                            EXPECT_TRUE(CircuitChecker::check(builder));
                        }
                    }
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
TYPED_TEST(BoolTest, ConstructFromWitnessRangeConstraint)
{
    TestFixture::test_construct_from_witness_range_constraint();
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

TYPED_TEST(BoolTest, TestSimpleProof)
{
    TestFixture::test_simple_proof();
}
TYPED_TEST(BoolTest, AssertEqual)
{
    TestFixture::test_assert_equal();
}
