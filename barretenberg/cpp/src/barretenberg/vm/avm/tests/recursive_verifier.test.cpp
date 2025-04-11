#include "barretenberg/vm/avm/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm/avm/generated/circuit_builder.hpp"
#include "barretenberg/vm/avm/generated/composer.hpp"
#include "barretenberg/vm/avm/recursion/goblin_avm_recursive_verifier.hpp"
#include "barretenberg/vm/avm/recursion/recursive_flavor.hpp"
#include "barretenberg/vm/avm/tests/helpers.test.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"

#include <gtest/gtest.h>

namespace bb::stdlib::recursion::honk {}

namespace tests_avm {

using namespace bb;
using namespace bb::avm;
using namespace bb::avm_trace;

class AvmRecursiveTests : public ::testing::Test {
  public:
    using AvmBuilder = bb::avm::AvmCircuitBuilder;
    using OuterBuilder = bb::UltraCircuitBuilder;

    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }

    struct AVMVerifierInput {
        using AvmVerificationKey = avm::AvmFlavor::VerificationKey;
        HonkProof proof;
        std::vector<std::vector<FF>> public_inputs_vec;
        std::shared_ptr<AvmVerificationKey> vkey;
    };

    // Generate native inputs to an AVM verifier based on the proof of a mock AVM circuit
    static AVMVerifierInput create_avm_verifier_input()
    {
        AvmBuilder circuit_builder = generate_avm_circuit();
        AvmComposer composer;

        // Construct the AVM proof
        AvmProver prover = composer.create_prover(circuit_builder);
        HonkProof proof = prover.construct_proof();
        std::vector<std::vector<FF>> public_inputs_vec = construct_public_inputs_vec();

        // Verify the AVM proof natively for good measure
        AvmVerifier verifier = composer.create_verifier(circuit_builder);
        bool verified = verifier.verify_proof(proof, public_inputs_vec);
        EXPECT_TRUE(verified) << "native proof verification failed";

        return { proof, public_inputs_vec, verifier.key };
    }

  private:
    // Generate an extremely simple avm trace
    static AvmBuilder generate_avm_circuit()
    {
        AvmPublicInputs public_inputs = generate_base_public_inputs();
        AvmTraceBuilder trace_builder(public_inputs);
        AvmBuilder builder;

        trace_builder.op_set(0, 1, 1, AvmMemoryTag::U8);
        trace_builder.op_set(0, 1, 2, AvmMemoryTag::U8);
        trace_builder.op_add(0, 1, 2, 3);
        trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
        trace_builder.op_return(0, 0, 100);
        auto trace = trace_builder.finalize(); // Passing true enables a longer trace with lookups

        inject_end_gas_values(public_inputs, trace);

        builder.set_trace(std::move(trace));
        builder.check_circuit();
        vinfo("inner builder - num gates: ", builder.get_estimated_num_finalized_gates());

        return builder;
    }

    static std::vector<std::vector<FF>> construct_public_inputs_vec()
    {
        // We just pad all the public inputs with the right number of zeroes
        std::vector<FF> kernel_inputs(KERNEL_INPUTS_LENGTH);
        std::vector<FF> kernel_value_outputs(KERNEL_OUTPUTS_LENGTH);
        std::vector<FF> kernel_side_effect_outputs(KERNEL_OUTPUTS_LENGTH);
        std::vector<FF> kernel_metadata_outputs(KERNEL_OUTPUTS_LENGTH);
        std::vector<FF> calldata{ {} };
        std::vector<FF> returndata{ {} };

        std::vector<std::vector<FF>> public_inputs_vec{
            kernel_inputs, kernel_value_outputs, kernel_side_effect_outputs, kernel_metadata_outputs, calldata,
            returndata
        };

        return public_inputs_vec;
    }
};

/**
 * @brief A test of the Goblinized AVM recursive verifier.
 * @details Constructs a simple AVM circuit for which a proof is verified using the Goblinized AVM recursive verifier. A
 * proof is constructed and verified for the outer (Ultra) circuit produced by this algorithm. See the documentation in
 * AvmGoblinRecursiveVerifier for details of the recursive verification algorithm.
 *
 */
TEST_F(AvmRecursiveTests, GoblinRecursion)
{
    using AvmRecursiveVerifier = avm::AvmGoblinRecursiveVerifier;
    using UltraRollupRecursiveFlavor = UltraRollupRecursiveFlavor_<UltraRollupFlavor::CircuitBuilder>;
    using UltraFF = UltraRollupRecursiveFlavor::FF;
    using UltraRollupProver = UltraProver_<UltraRollupFlavor>;
    using AggregationObject = stdlib::recursion::aggregation_state<OuterBuilder>;

    // Generate the inputs to an AVM verifier
    auto [proof, public_inputs_vec, verification_key] = create_avm_verifier_input();

    OuterBuilder outer_circuit;

    // Construct stdlib representations of the proof, public inputs and verification key
    StdlibProof<OuterBuilder> stdlib_proof = bb::convert_native_proof_to_stdlib(&outer_circuit, proof);

    std::vector<std::vector<UltraFF>> public_inputs_ct;
    public_inputs_ct.reserve(public_inputs_vec.size());
    for (const auto& vec : public_inputs_vec) {
        std::vector<UltraFF> vec_ct;
        vec_ct.reserve(vec.size());
        for (const auto& val : vec) {
            vec_ct.push_back(bb::stdlib::witness_t<OuterBuilder>(&outer_circuit, val));
        }
        public_inputs_ct.push_back(vec_ct);
    }

    auto key_fields_native = verification_key->to_field_elements();
    std::vector<UltraFF> outer_key_fields;
    for (const auto& f : key_fields_native) {
        UltraFF val = UltraFF::from_witness(&outer_circuit, f);
        outer_key_fields.push_back(val);
    }

    // Construct the AVM recursive verifier
    AvmRecursiveVerifier verifier(&outer_circuit, outer_key_fields);
    auto agg_obj = AggregationObject::construct_default(outer_circuit);
    auto verifier_output = verifier.verify_proof(stdlib_proof, public_inputs_ct, agg_obj);

    // Ensure that the pairing check is satisfied on the outputs of the recursive verifier
    bool agg_output_valid = verification_key->pcs_verification_key->pairing_check(
        verifier_output.aggregation_object.P0.get_value(), verifier_output.aggregation_object.P1.get_value());
    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    // Construct and verify an Ultra Rollup proof of the AVM recursive verifier circuit. This proof carries an IPA claim
    // from ECCVM recursive verification in its public inputs that will be verified as part of the UltraRollupVerifier.
    auto outer_proving_key = std::make_shared<DeciderProvingKey_<UltraRollupFlavor>>(outer_circuit);
    UltraRollupProver outer_prover(outer_proving_key);
    auto outer_proof = outer_prover.construct_proof();

    // Verify the proof of the Ultra circuit that verified the AVM recursive verifier circuit
    auto outer_verification_key = std::make_shared<UltraRollupFlavor::VerificationKey>(outer_proving_key->proving_key);
    auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    UltraRollupVerifier final_verifier(outer_verification_key, ipa_verification_key);

    EXPECT_TRUE(final_verifier.verify_proof(outer_proof, outer_proving_key->proving_key.ipa_proof));
}

/**
 * @brief A test of the "vanilla" Ultra-arithmetized AVM recursive verifier.
 *
 */
TEST_F(AvmRecursiveTests, recursion)
{
    if (std::getenv("AVM_ENABLE_FULL_PROVING") == nullptr) {
        GTEST_SKIP();
    }

    using AvmRecursiveFlavor = AvmRecursiveFlavor_<UltraCircuitBuilder>;
    using AvmRecursiveVerifier = bb::avm::AvmRecursiveVerifier_<AvmRecursiveFlavor>;
    using DeciderProvingKey = DeciderProvingKey_<UltraFlavor>;
    using AggregationObject = stdlib::recursion::aggregation_state<OuterBuilder>;

    // Generate the inputs to an AVM verifier
    auto [proof, public_inputs_vec, verification_key] = create_avm_verifier_input();

    // Construct an AVM recursive verifier circuit
    OuterBuilder outer_circuit;
    AvmRecursiveVerifier recursive_verifier{ &outer_circuit, verification_key };
    auto agg_object = AggregationObject::construct_default(outer_circuit);
    auto agg_output = recursive_verifier.verify_proof(proof, public_inputs_vec, agg_object);

    // Ensure that the pairing check is satisfed on the outputs of the recursive verifier
    bool agg_output_valid =
        verification_key->pcs_verification_key->pairing_check(agg_output.P0.get_value(), agg_output.P1.get_value());
    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    // Run check circuit on the recursive verifier circuit
    bool outer_circuit_checked = CircuitChecker::check(outer_circuit);
    ASSERT_TRUE(outer_circuit_checked) << "outer circuit check failed";

    // Check that the native and recursive verification keys have equivalent values
    for (auto const [key_el, rec_key_el] : zip_view(verification_key->get_all(), recursive_verifier.key->get_all())) {
        EXPECT_EQ(key_el, rec_key_el.get_value());
    }
    EXPECT_EQ(verification_key->circuit_size, static_cast<uint64_t>(recursive_verifier.key->circuit_size.get_value()));
    EXPECT_EQ(verification_key->num_public_inputs,
              static_cast<uint64_t>(recursive_verifier.key->num_public_inputs.get_value()));

    // Construct and verify an Ultra proof of the AVM recursive verifier circuit
    const size_t srs_size = 1 << 23;
    auto ultra_instance = std::make_shared<DeciderProvingKey>(
        outer_circuit, TraceSettings{}, std::make_shared<bb::CommitmentKey<curve::BN254>>(srs_size));
    UltraProver ultra_prover(ultra_instance);
    auto ultra_proof = ultra_prover.construct_proof();

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    UltraVerifier ultra_verifier(ultra_verification_key);
    EXPECT_TRUE(ultra_verifier.verify_proof(ultra_proof)) << "recursion proof verification failed";
}
} // namespace tests_avm
