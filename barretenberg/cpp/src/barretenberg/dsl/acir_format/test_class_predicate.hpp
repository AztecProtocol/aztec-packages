// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "gtest/gtest.h"
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * NOTE: A predicate can either be a constant or a witness. When it is a constant, the code doesn't take into account
 * the value held in the predicate struct, it always behaves as if the predicate is a constant holding the value true.
 * Thus, there are only three cases we need to test.
 */
enum class PredicateTestCase : uint8_t { ConstantTrue, WitnessTrue, WitnessFalse };

template <typename InvalidWitnessTarget> struct Predicate {
    PredicateTestCase test_case;
    InvalidWitnessTarget invalid_witness;

    std::vector<PredicateTestCase> static get_all()
    {
        return { PredicateTestCase::ConstantTrue, PredicateTestCase::WitnessTrue, PredicateTestCase::WitnessFalse };
    }

    std::vector<std::string> static get_labels() { return { "ConstantTrue", "WitnessTrue", "WitnessFalse" }; }
};

/**
 * @brief Concept defining the requirements for the Base template parameter of TestClassWithPredicate
 *
 * @details Base must provide:
 * - A struct InvalidWitness, which specifies how to invalidate witness values to test predicate behavior.
 *   InvalidWitness must specify an enum class Target, which details the different invalidation targets (e.g.,
 *   inputs, outputs, specific validation cases), and two functions get_all() and get_labels() to iterate over
 *   all possible invalidation targets.
 * - Type aliases: Builder and AcirConstraint, specifying the Builder and constraint we are working with.
 * - Static methods: invalidate_witness (to invalidate witness values based on the target), generate_constraints
 *   (to generate valid constraints with predicate set to witness true).
 */
template <typename T>
concept TestBaseWithPredicate = requires {
    // Required type aliases
    typename T::Builder;
    typename T::InvalidWitness;
    typename T::InvalidWitness::Target;
    typename T::AcirConstraint;

    // Ensure InvalidWitness::Target is an enum
    requires std::is_enum_v<typename T::InvalidWitness::Target>;

    // Ensure that InvalidWitness::Target has a None value
    { T::InvalidWitness::Target::None };

    // InvalidWitness must provide static methods for test iteration
    { T::InvalidWitness::get_all() } -> std::same_as<std::vector<typename T::InvalidWitness::Target>>;
    { T::InvalidWitness::get_labels() } -> std::same_as<std::vector<std::string>>;

    // Required static constraint manipulation methods
    requires requires(typename T::AcirConstraint& constraint,
                      WitnessVector& witness_values,
                      const typename T::InvalidWitness::Target& invalid_witness_target) {
        /**
         * @brief Invalidate witness values based on the target
         *
         * @details This function is used to invalidate specific witnesses to test that:
         * 1. Constraints fail when predicate is true and witnesses are invalid
         * 2. Constraints succeed when predicate is false, regardless of witness validity
         *
         */
        { T::invalidate_witness(constraint, witness_values, invalid_witness_target) } -> std::same_as<void>;

        /**
         * @brief Generate valid constraints with predicate set to a witness holding the value true.
         *
         */
        { T::generate_constraints(constraint, witness_values) } -> std::same_as<void>;
    };
};

/**
 * @brief Test class for ACIR constraints that contain a predicate.
 */
template <TestBaseWithPredicate Base> class TestClassWithPredicate {
  public:
    using Builder = Base::Builder;
    using InvalidWitness = Base::InvalidWitness;
    using InvalidWitnessTarget = InvalidWitness::Target;
    using AcirConstraint = Base::AcirConstraint;

    /**
     * @brief Update the constraint and the witness based on the predicate
     *
     * @param constraint
     * @param witness_values
     * @param mode
     * @param forced_invalidation If true, forces the witness to be invalidated even if the predicate is not witness
     * false. Used to check that the circuit fails if the predicate is witness true and witnesses are invalid.
     */
    static void update_witness_based_on_predicate(AcirConstraint& constraint,
                                                  WitnessVector& witness_values,
                                                  const Predicate<InvalidWitnessTarget>& mode)
    {
        switch (mode.test_case) {
        case PredicateTestCase::ConstantTrue:
            constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(1));
            witness_values.pop_back();
            break;
        case PredicateTestCase::WitnessTrue:
            // Nothing to do - keep default witness predicate
            break;
        case PredicateTestCase::WitnessFalse:
            witness_values[constraint.predicate.index] = bb::fr(0);
            break;
        }
        // Apply witness invalidation for all cases
        Base::invalidate_witness(constraint, witness_values, mode.invalid_witness);
    }

    /**
     * @brief Generate constraints and witness values based on the predicate and the invalidation target.
     */
    static std::pair<AcirConstraint, WitnessVector> generate_constraints(const Predicate<InvalidWitnessTarget>& mode)
    {
        AcirConstraint constraint;
        WitnessVector witness_values;
        Base::generate_constraints(constraint, witness_values);
        update_witness_based_on_predicate(constraint, witness_values, mode);

        return { constraint, witness_values };
    }

    /**
     * @brief General purpose testing function. It generates the test based on the predicate and invalidation target.
     */
    static std::tuple<bool, bool, std::string> test_constraints(const PredicateTestCase& test_case,
                                                                const InvalidWitnessTarget& invalid_witness_target)
    {
        Predicate<InvalidWitnessTarget> predicate = { .test_case = test_case,
                                                      .invalid_witness = invalid_witness_target };
        auto [constraint, witness_values] = generate_constraints(predicate);

        AcirFormat constraint_system = {
            .varnum = static_cast<uint32_t>(witness_values.size()),
            .num_acir_opcodes = 1,
            .public_inputs = {},
            .original_opcode_indices = create_empty_original_opcode_indices(),
        };

        add_constraint_to_acir_format(constraint_system, constraint);

        mock_opcode_indices(constraint_system);

        AcirProgram program{ constraint_system, witness_values };
        auto builder = create_circuit<Builder>(program);

        return { CircuitChecker::check(builder), builder.failed(), builder.err() };
    }

    /**
     * @brief Test vk generation is independent of the witness values supplied.
     *
     * @tparam Flavor
     */
    template <typename Flavor> static std::vector<size_t> test_vk_independence()
    {
        using ProverInstance = ProverInstance_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        std::vector<size_t> num_gates;

        for (auto [predicate_case, label] :
             zip_view(Predicate<InvalidWitnessTarget>::get_all(), Predicate<InvalidWitnessTarget>::get_labels())) {
            vinfo("Testing vk independence for predicate case: ", label);

            // Generate the constraint system
            Predicate<InvalidWitnessTarget> predicate = { .test_case = predicate_case,
                                                          .invalid_witness = InvalidWitnessTarget::None };
            auto [constraint, witness_values] = generate_constraints(predicate);

            AcirFormat constraint_system = {
                .varnum = static_cast<uint32_t>(witness_values.size()),
                .num_acir_opcodes = 1,
                .public_inputs = {},
                .original_opcode_indices = create_empty_original_opcode_indices(),
            };

            add_constraint_to_acir_format(constraint_system, constraint);

            mock_opcode_indices(constraint_system);

            // Construct the vks
            std::shared_ptr<VerificationKey> vk_from_witness;
            {
                AcirProgram program{ constraint_system, witness_values };
                auto builder = create_circuit<Builder>(program);
                num_gates.emplace_back(builder.get_num_finalized_gates_inefficient());

                auto prover_instance = std::make_shared<ProverInstance>(builder);
                vk_from_witness = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

                // Validate the builder
                EXPECT_TRUE(CircuitChecker::check(builder));
            }

            std::shared_ptr<VerificationKey> vk_from_constraint;
            {
                AcirProgram program{ constraint_system, /*witness=*/{} };
                auto builder = create_circuit<Builder>(program);
                auto prover_instance = std::make_shared<ProverInstance>(builder);
                vk_from_constraint = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
            }

            EXPECT_EQ(*vk_from_witness, *vk_from_constraint) << "Mismatch in the vks for predicate case " << label;
            vinfo("VK independence passed for predicate case: ", label);
        }

        return num_gates;
    }

    /**
     * @brief Test all cases in which the predicate is a constant holding the value true.
     *
     * @details When the predicate is a constant true, the constraint is always active and must be satisfied.
     * This test verifies two scenarios:
     * 1. With valid witnesses (no invalidation): the circuit should succeed
     * 2. With invalid witnesses (using default_invalid_witness_target): the circuit should fail
     *
     * @param default_invalid_witness_target Invalidation target to be used to check that the circuit fails when
     * witnesses are invalid.
     */
    static void test_constant_true(InvalidWitnessTarget default_invalid_witness_target)
    {
        // Constant true, no invalidation
        {
            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::ConstantTrue, InvalidWitnessTarget::None);
            EXPECT_TRUE(circuit_checker_result) << "Circuit checker failed.";
            EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly.";
        }

        // Constant true, default invalidation
        {
            auto [circuit_checker_result, builder_failed, builder_err] =
                test_constraints(PredicateTestCase::ConstantTrue, default_invalid_witness_target);
            // As `assert_equal` doesn't make the CircuitChecker fail, we need to check that either the CircuitChecker
            // failed, or the builder error resulted from an assert_eq.
            bool circuit_check_failed = !circuit_checker_result;
            bool assert_eq_error_present = (builder_err.find("assert_eq") != std::string::npos);
            EXPECT_TRUE(circuit_check_failed || assert_eq_error_present)
                << "Circuit checker succeeded unexpectedly and no assert_eq failure.";
            EXPECT_TRUE(builder_failed) << "Builder succeeded unexpectedly.";
        }
    }

    /**
     * @brief Test all cases in which the predicate is a witness holding the value true.
     *
     * @details When the predicate is a witness set to true, the constraint is active and must be satisfied.
     * This test verifies two scenarios:
     * 1. With valid witnesses (no invalidation): the circuit should succeed
     * 2. With invalid witnesses (using default_invalid_witness_target): the circuit should fail
     *
     * @param default_invalid_witness_target Invalidation target to be used to check that the circuit fails when
     * witnesses are invalid.
     */
    static void test_witness_true(InvalidWitnessTarget default_invalid_witness_target)
    {
        // Witness true, no invalidation
        {
            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::WitnessTrue, InvalidWitnessTarget::None);
            EXPECT_TRUE(circuit_checker_result) << "Circuit checker failed.";
            EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly.";
        }

        // Witness true, default invalidation
        {
            auto [circuit_checker_result, builder_failed, builder_err] =
                test_constraints(PredicateTestCase::WitnessTrue, default_invalid_witness_target);
            // As `assert_equal` doesn't make the CircuitChecker fail, we need to check that either the CircuitChecker
            // failed, or the builder error resulted from an assert_eq.
            bool circuit_check_failed = !circuit_checker_result;
            bool assert_eq_error_present = (builder_err.find("assert_eq") != std::string::npos);
            EXPECT_TRUE(circuit_check_failed || assert_eq_error_present)
                << "Circuit checker succeeded unexpectedly and no assert_eq failure.";
            EXPECT_TRUE(builder_failed) << "Builder succeeded unexpectedly.";
        }
    }

    /**
     * @brief Test all invalid witness cases for the witness false predicate case.
     *
     * @details When the predicate is a witness set to false, the constraint is disabled and should not fail
     * regardless of witness validity. This test iterates through ALL invalid witness targets (None, and all specific
     * invalidation cases) and verifies that the circuit succeeds in every case when predicate = false.
     */
    static void test_witness_false()
    {
        for (auto [invalid_witness_target, target_label] :
             zip_view(InvalidWitness::get_all(), InvalidWitness::get_labels())) {
            vinfo("Testing invalid witness target: ", target_label);

            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::WitnessFalse, invalid_witness_target);

            EXPECT_TRUE(circuit_checker_result) << "Check builder failed for invalid witness target " + target_label;
            EXPECT_FALSE(builder_failed) << "Builder failed for invalid witness target " + target_label;
            vinfo("Passed invalid witness target: ", target_label);
        }
    }

    /**
     * @brief Test all invalid witness cases for the witness false predicate case (slow comprehensive version).
     *
     * @details This is an extended version of test_witness_false that performs double verification:
     *
     * For each invalid witness target:
     * 1. First pass (predicate = false): Verifies the circuit succeeds with invalid witnesses when predicate is false
     * 2. Second pass (predicate = true): Verifies the SAME invalid witness configuration would
     *    fail if the predicate were true
     *
     * The second pass validates that our invalidation logic is actually creating invalid inputs. Useful for debugging.
     */
    static void test_witness_false_slow()
    {
        for (auto [invalid_witness_target, target_label] :
             zip_view(InvalidWitness::get_all(), InvalidWitness::get_labels())) {
            vinfo("Testing invalid witness target: ", target_label);

            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::WitnessFalse, invalid_witness_target);

            EXPECT_TRUE(circuit_checker_result) << "Check builder failed for invalid witness target " + target_label;
            EXPECT_FALSE(builder_failed) << "Builder failed for invalid witness target " + target_label;
            vinfo("Passed invalid witness target: ", target_label);

            // Only validate witness true failure for actual invalidation targets (skip None)
            if (invalid_witness_target != InvalidWitnessTarget::None) {
                // Check that the same configuration would have failed if the predicate was witness true
                auto [circuit_checker_result, builder_failed, builder_err] =
                    test_constraints(PredicateTestCase::WitnessTrue, invalid_witness_target);

                // As `assert_equal` doesn't make the CircuitChecker fail, we need to check that either the
                // CircuitChecker failed, or the builder error resulted from an assert_eq.
                bool circuit_check_failed = !circuit_checker_result;
                bool assert_eq_error_present = (builder_err.find("assert_eq") != std::string::npos);
                EXPECT_TRUE(circuit_check_failed || assert_eq_error_present)
                    << "Circuit checker succeeded unexpectedly and no assert_eq failure for invalid witness target " +
                           target_label;
                EXPECT_TRUE(builder_failed) << "Builder succeeded for invalid witness target " + target_label;
                vinfo("Passed invalid witness target (witness true confirmation): ", target_label);
            }
        }
    }

    /**
     * @brief Test all invalid witness targets across all predicate cases (comprehensive matrix test).
     *
     * @details This is a comprehensive test that creates a matrix of all combinations:
     * - Predicate cases: ConstantTrue, WitnessTrue, WitnessFalse
     * - Invalid witness targets: None, and all constraint-specific invalidation targets
     *
     * Expected behavior:
     * - When predicate is TRUE (constant or witness) and target is None: circuit succeeds (valid witnesses)
     * - When predicate is TRUE (constant or witness) and target is NOT None: circuit fails (invalid witnesses detected)
     * - When predicate is FALSE and target is ANY value: circuit succeeds
     *
     * @return std::vector<std::string> List of error messages from the builder for each test case.
     */
    static std::vector<std::string> test_invalid_witnesses()
    {
        std::vector<std::string> error_msgs;
        for (auto [predicate_case, predicate_label] :
             zip_view(Predicate<InvalidWitnessTarget>::get_all(), Predicate<InvalidWitnessTarget>::get_labels())) {
            for (auto [target, label] : zip_view(InvalidWitness::get_all(), InvalidWitness::get_labels())) {
                auto [circuit_checker_result, builder_failed, builder_err] = test_constraints(predicate_case, target);
                error_msgs.emplace_back(builder_err);

                if (predicate_case != PredicateTestCase::WitnessFalse) {
                    // If the predicate is not witness false, invalid witnesses should cause failure
                    if (target != InvalidWitnessTarget::None) {
                        bool circuit_check_failed = !circuit_checker_result;
                        bool assert_eq_error_present = (builder_err.find("assert_eq") != std::string::npos);
                        EXPECT_TRUE(circuit_check_failed || assert_eq_error_present)
                            << "Circuit checker succeeded unexpectedly and no assert_eq failure for invalid witness "
                               "target " +
                                   label + " with predicate " + predicate_label;
                        EXPECT_TRUE(builder_failed) << "Builder succeeded unexpectedly for invalid witness target " +
                                                           label + " with predicate " + predicate_label;
                    } else {
                        EXPECT_TRUE(circuit_checker_result)
                            << "Circuit checker failed unexpectedly for invalid witness target " + label +
                                   " with predicate " + predicate_label;
                        EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly for invalid witness target " +
                                                            label + " with predicate " + predicate_label;
                    }
                } else {
                    // If the predicate is witness false, all cases should succeed
                    EXPECT_TRUE(circuit_checker_result) << "Circuit checker failed unexpectedly for invalid witness "
                                                           "target " +
                                                               label + " with predicate " + predicate_label;
                    EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly for invalid witness target " + label +
                                                        " with predicate " + predicate_label;
                }
            }
        }
        return error_msgs;
    }
};

} // namespace acir_format
