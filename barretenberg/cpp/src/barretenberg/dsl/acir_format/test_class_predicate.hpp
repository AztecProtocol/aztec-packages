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

template <typename WitnessOverrideCase> struct Predicate {
    PredicateTestCase test_case;
    WitnessOverrideCase witness_override;

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
 * - A struct Tampering, which specifies how to tamper with the witness values so to make the constraints
 *   unsatisfied. Tampering must specify an enum class Mode, which details the different tampering modes, and two
 *   functions get_all() and get_labels() to iterate over all the possible tampering modes.
 * - A struct WitnessOverride, which specifies how to override witness values so to test cases that would generate
 *   unsatisfied constraints, but that should pass if the predicate is a witness holding the value false.
 *   WitnessOverride must specify an enum class Case, which details which witness value should be overridden, and
 *   two functions get_all() and get_labels() to iterate over all the possible override cases.
 * - Type aliases: Builder and AcirConstraint, specifying the Builder and constraint we are working with.
 * - Static methods: override_witness (to override the witness values based on the WitnessOverride case),
 *   generate_constraints (to generate valid constraints with predicate set to witness true), tampering (to tamper
 * with the witness values to produce unsatisfied constraints).
 */
template <typename T>
concept TestBaseWithPredicate = requires {
    // Required type aliases
    typename T::Builder;
    typename T::WitnessOverride;
    typename T::WitnessOverride::Case;
    typename T::AcirConstraint;
    typename T::Tampering;
    typename T::Tampering::Mode;

    // Ensure WitnessOverride::Case and Tampering::Mode are enums
    requires std::is_enum_v<typename T::WitnessOverride::Case>;
    requires std::is_enum_v<typename T::Tampering::Mode>;

    // Ensure that WitnessOverride::Case has a None value
    { T::WitnessOverride::Case::None };
    // Ensure that Tampering::Mode has a None value
    { T::Tampering::Mode::None };

    // WitnessOverride and Tampering must provide static methods for test iteration
    { T::WitnessOverride::get_all() } -> std::same_as<std::vector<typename T::WitnessOverride::Case>>;
    { T::WitnessOverride::get_labels() } -> std::same_as<std::vector<std::string>>;
    { T::Tampering::get_all() } -> std::same_as<std::vector<typename T::Tampering::Mode>>;
    { T::Tampering::get_labels() } -> std::same_as<std::vector<std::string>>;

    // Required static constraint manipulation methods
    requires requires(typename T::AcirConstraint& constraint,
                      WitnessVector& witness_values,
                      const typename T::WitnessOverride::Case& witness_override,
                      const typename T::Tampering::Mode& tampering_mode) {
        /**
         * @brief Override the witness values based on the override case
         *
         * @details This function is used when the predicate is a witness set to false, in which case we need to
         * test our constraints correctly override each value which would produce an unsatisfied constraint.
         *
         */
        { T::override_witness(constraint, witness_values, witness_override) } -> std::same_as<void>;

        /**
         * @brief Generate valid constraints with predicate set to a witness holding the value true.
         *
         */
        { T::generate_constraints(constraint, witness_values) } -> std::same_as<void>;

        /**
         * @brief Tamper with the witness values to test that invalid witnesses produce unsatisfied constraints.
         *
         */
        { T::tampering(constraint, witness_values, tampering_mode) } -> std::same_as<void>;
    };
};

/**
 * @brief Test class for ACIR constraints that contain a predicate.
 */
template <TestBaseWithPredicate Base> class TestClassWithPredicate {
  public:
    using Builder = Base::Builder;
    using WitnessOverride = Base::WitnessOverride;
    using WitnessOverrideCase = WitnessOverride::Case;
    using AcirConstraint = Base::AcirConstraint;
    using Tampering = Base::Tampering;
    using TamperingMode = Base::Tampering::Mode;

    /**
     * @brief Update the constraint and the witness based on the predicate
     *
     * @param constraint
     * @param witness_values
     * @param mode
     * @param forced_override If true, forces the witness to be overridden even if the predicate is not witness false.
     * Used to check that the circuit fails if the predicate is witness true and the circuit doesn't correctly assign
     * witness values depending on the predicate.
     */
    static void update_witness_based_on_predicate(AcirConstraint& constraint,
                                                  WitnessVector& witness_values,
                                                  const Predicate<WitnessOverrideCase>& mode,
                                                  const bool forced_override = false)
    {
        switch (mode.test_case) {
        case PredicateTestCase::ConstantTrue:
            constraint.predicate = WitnessOrConstant<bb::fr>::from_constant(bb::fr(1));
            witness_values.pop_back();
            break;
        case PredicateTestCase::WitnessTrue:
            if (forced_override) {
                Base::override_witness(constraint, witness_values, mode.witness_override);
            }
            break;
        case PredicateTestCase::WitnessFalse:
            witness_values[constraint.predicate.index] = bb::fr(0);
            Base::override_witness(constraint, witness_values, mode.witness_override);
        }
    }

    /**
     * @brief Generate constraints and witness values based on the predicate and the tampering mode.
     */
    static std::pair<AcirConstraint, WitnessVector> generate_constraints(
        const Predicate<WitnessOverrideCase>& mode,
        const TamperingMode& tampering_mode = TamperingMode::None,
        const bool forced_override = false)
    {
        AcirConstraint constraint;
        WitnessVector witness_values;
        Base::generate_constraints(constraint, witness_values);
        update_witness_based_on_predicate(constraint, witness_values, mode, forced_override);
        Base::tampering(constraint, witness_values, tampering_mode);

        return { constraint, witness_values };
    }

    /**
     * @brief General purpose testing function. It generates the test based on the predicate, witness override case,
     * and the tampering mode.
     */
    static std::tuple<bool, bool, std::string> test_constraints(const PredicateTestCase& test_case,
                                                                const WitnessOverrideCase& witness_override,
                                                                const TamperingMode& tampering_mode,
                                                                const bool forced_override = false)
    {
        Predicate<WitnessOverrideCase> predicate = { .test_case = test_case, .witness_override = witness_override };
        auto [constraint, witness_values] = generate_constraints(predicate, tampering_mode, forced_override);

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
    template <typename Flavor> static void test_vk_independence()
    {
        using ProverInstance = ProverInstance_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        for (auto [predicate_case, label] :
             zip_view(Predicate<WitnessOverrideCase>::get_all(), Predicate<WitnessOverrideCase>::get_labels())) {
            vinfo("Testing vk independence for predicate case: ", label);

            // Generate the constraint system
            Predicate<WitnessOverrideCase> predicate = { .test_case = predicate_case,
                                                         .witness_override = WitnessOverrideCase::None };
            auto [constraint, witness_values] = generate_constraints(predicate, TamperingMode::None);

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
                info("Num gates: ", builder.get_num_finalized_gates_inefficient());

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
    }

    /**
     * @brief Test all cases in which the predicate is a constant holding the value true.
     *
     * @param default_tampering_mode Tampering mode to be used to check that the circuit fails when tampered.
     */
    static void test_constant_true(TamperingMode default_tampering_mode)
    {
        // Constant true, no tampering
        {
            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::ConstantTrue, WitnessOverrideCase::None, TamperingMode::None);
            EXPECT_TRUE(circuit_checker_result) << "Circuit checker failed.";
            EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly.";
        }

        // Constant true, default tampering
        {
            auto [circuit_checker_result, builder_failed, builder_err] =
                test_constraints(PredicateTestCase::ConstantTrue, WitnessOverrideCase::None, default_tampering_mode);
            // As `assert_equal` doesn't make the CircuitChecker fail, we need to check that either the CircuitChecker
            // failed, or the builder error resulted from an assert_eq.
            EXPECT_FALSE(circuit_checker_result && (builder_err.find("assert_eq") != std::string::npos))
                << "Circuit checker succeeded unexpectedly and no assert_eq failure.";
            EXPECT_TRUE(builder_failed) << "Builder succeeded unexpectedly.";
        }
    }

    /**
     * @brief Test all cases in which the predicate is a witness holding the value true.
     *
     * @param default_tampering_mode Tampering mode to be used to check that the circuit fails when tampered.
     */
    static void test_witness_true(TamperingMode default_tampering_mode)
    {
        // Witness true, no tampering
        {
            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::WitnessTrue, WitnessOverrideCase::None, TamperingMode::None);
            EXPECT_TRUE(circuit_checker_result) << "Circuit checker failed.";
            EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly.";
        }

        // Witness true, default tampering
        {
            auto [circuit_checker_result, builder_failed, builder_err] =
                test_constraints(PredicateTestCase::WitnessTrue, WitnessOverrideCase::None, default_tampering_mode);
            // As `assert_equal` doesn't make the CircuitChecker fail, we need to check that either the CircuitChecker
            // failed, or the builder error resulted from an assert_eq.
            EXPECT_FALSE(circuit_checker_result && (builder_err.find("assert_eq") != std::string::npos))
                << "Circuit checker succeeded unexpectedly and no assert_eq failure.";
            EXPECT_TRUE(builder_failed) << "Builder succeeded unexpectedly.";
        }
    }

    /**
     * @brief Test all witness override cases for the witness false predicate case.
     *
     * @param default_tampering_mode Tampering mode to be used to check that the circuit succeeds when tampered if the
     * predicate is witness false.
     */
    static void test_witness_false(TamperingMode default_tampering_mode)
    {
        for (auto [override_case, override_label] :
             zip_view(WitnessOverride::get_all(), WitnessOverride::get_labels())) {
            vinfo("Testing witness override case: ", override_label);

            auto tampering_mode =
                override_case == WitnessOverrideCase::None ? default_tampering_mode : TamperingMode::None;
            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::WitnessFalse, override_case, tampering_mode);

            EXPECT_TRUE(circuit_checker_result) << "Check builder failed for override case " + override_label;
            EXPECT_FALSE(builder_failed) << "Builder failed for override case " + override_label;
            vinfo("Passed override case: ", override_label);
        }
    }

    /**
     * @brief Test all witness override cases for the witness false predicate case.
     *
     * @details This version of test_witness_false also checks that each configuration would have failed if the
     * predicate was witness true. Useful for debugging.
     *
     * @param default_tampering_mode Tampering mode to be used to check that the circuit succeeds when tampered if the
     * predicate is witness false.
     */
    static void test_witness_false_slow(TamperingMode default_tampering_mode)
    {
        for (auto [override_case, override_label] :
             zip_view(WitnessOverride::get_all(), WitnessOverride::get_labels())) {
            vinfo("Testing witness override case: ", override_label);

            auto tampering_mode =
                override_case == WitnessOverrideCase::None ? default_tampering_mode : TamperingMode::None;
            auto [circuit_checker_result, builder_failed, _] =
                test_constraints(PredicateTestCase::WitnessFalse, override_case, tampering_mode);

            EXPECT_TRUE(circuit_checker_result) << "Check builder failed for override case " + override_label;
            EXPECT_FALSE(builder_failed) << "Builder failed for override case " + override_label;
            vinfo("Passed override case: ", override_label);

            {
                // Check that the same configuration would have failed if the predicate was witness true
                auto [circuit_checker_result, builder_failed, builder_err] = test_constraints(
                    PredicateTestCase::WitnessTrue, override_case, tampering_mode, /*forced_override=*/true);

                // As `assert_equal` doesn't make the CircuitChecker fail, we need to check that either the
                // CircuitChecker failed, or the builder error resulted from an assert_eq.
                EXPECT_FALSE(circuit_checker_result && (builder_err.find("assert_eq") != std::string::npos))
                    << "Circuit checker succeeded unexpectedly and no assert_eq failure for override case " +
                           override_label;
                EXPECT_TRUE(builder_failed) << "Builder succeeded for override case " + override_label;
                vinfo("Passed override case (witness true confirmation): ", override_label);
            }
        }
    }

    /**
     * @brief Test all tampering modes.
     *
     * @return std::vector<std::string> List of error messages from the builder for each tampering mode.
     */
    static std::vector<std::string> test_tampering()
    {
        std::vector<std::string> error_msgs;
        for (auto [predicate_case, predicate_label] :
             zip_view(Predicate<WitnessOverrideCase>::get_all(), Predicate<WitnessOverrideCase>::get_labels())) {
            for (auto [mode, label] : zip_view(Tampering::get_all(), Tampering::get_labels())) {
                auto [circuit_checker_result, builder_failed, builder_err] =
                    test_constraints(predicate_case, WitnessOverrideCase::None, mode);
                error_msgs.emplace_back(builder_err);

                if (predicate_case != PredicateTestCase::WitnessFalse) {
                    // If the predicate is not witness false, tampering should cause failure
                    if (mode != Tampering::Mode::None) {
                        EXPECT_FALSE(circuit_checker_result && (builder_err.find("assert_eq") != std::string::npos))
                            << "Circuit checker succeeded unexpectedly and no assert_eq failure for tampering mode " +
                                   label + " with predicate " + predicate_label;
                        EXPECT_TRUE(builder_failed) << "Builder succeeded unexpectedly for tampering mode " + label +
                                                           " with predicate " + predicate_label;
                    } else {
                        EXPECT_TRUE(circuit_checker_result)
                            << "Circuit checker failed unexpectedly for tampering mode " + label + " with predicate " +
                                   predicate_label;
                        EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly for tampering mode " + label +
                                                            " with predicate " + predicate_label;
                    }
                } else {
                    EXPECT_TRUE(circuit_checker_result) << "Circuit checker failed unexpectedly for tampering mode " +
                                                               label + " with predicate " + predicate_label;
                    EXPECT_FALSE(builder_failed) << "Builder failed unexpectedly for tampering mode " + label +
                                                        " with predicate " + predicate_label;
                }
            }
        }
        return error_msgs;
    }
};

} // namespace acir_format
