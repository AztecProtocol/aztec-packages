#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/private_execution_steps.hpp"
#include "barretenberg/plonk/composer/ultra_composer.hpp"
#ifndef __wasm__
#include "barretenberg/api/exec_pipe.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"

#include <filesystem>
#include <gtest/gtest.h>

// #define LOG_SIZES

using namespace bb;
class AcirIntegrationTest : public ::testing::Test {
  public:
    static std::vector<uint8_t> get_bytecode(const std::string& bytecodePath)
    {
        std::filesystem::path filePath = bytecodePath;
        if (filePath.extension() == ".json") {
            // Try reading json files as if they are a Nargo build artifact
            std::string command = "jq -r '.bytecode' \"" + bytecodePath + "\" | base64 -d | gunzip -c";
            return exec_pipe(command);
        }

        // For other extensions, assume file is a raw ACIR program
        std::string command = "gunzip -c \"" + bytecodePath + "\"";
        return exec_pipe(command);
    }

    // Function to check if a file exists
    static bool file_exists(const std::string& path)
    {
        std::ifstream file(path);
        return file.good();
    }

    static acir_format::AcirProgramStack get_program_stack_data_from_test_file(const std::string& test_program_name)
    {
        std::string base_path = "../../acir_tests/acir_tests/" + test_program_name + "/target";
        std::string bytecode_path = base_path + "/program.json";
        std::string witness_path = base_path + "/witness.gz";

        return acir_format::get_acir_program_stack(bytecode_path, witness_path);
    }

    static acir_format::AcirProgram get_program_data_from_test_file(const std::string& test_program_name)
    {
        auto program_stack = get_program_stack_data_from_test_file(test_program_name);
        ASSERT(program_stack.size() == 1); // Otherwise this method will not return full stack data

        return program_stack.back();
    }

    template <class Flavor> bool prove_and_verify_honk(Flavor::CircuitBuilder& builder)
    {
        using Prover = UltraProver_<Flavor>;
        using Verifier = UltraVerifier_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        Prover prover{ builder };
#ifdef LOG_SIZES
        builder.blocks.summarize();
        info("num gates          = ", builder.get_estimated_num_finalized_gates());
        info("total circuit size = ", builder.get_estimated_total_circuit_size());
        info("circuit size       = ", prover.proving_key->proving_key.circuit_size);
        info("log circuit size   = ", prover.proving_key->proving_key.log_circuit_size);
#endif
        auto proof = prover.construct_proof();

        // Verify Honk proof
        auto verification_key = std::make_shared<VerificationKey>(prover.proving_key->proving_key);
        Verifier verifier{ verification_key };
        return verifier.verify_proof(proof);
    }

    template <class Flavor> bool prove_and_verify_plonk(Flavor::CircuitBuilder& builder)
    {
        plonk::UltraComposer composer;

        auto prover = composer.create_prover(builder);
#ifdef LOG_SIZES
        // builder.blocks.summarize();
        // info("num gates          = ", builder.get_estimated_num_finalized_gates());
        // info("total circuit size = ", builder.get_estimated_total_circuit_size());
#endif
        auto proof = prover.construct_proof();
#ifdef LOG_SIZES
        // info("circuit size       = ", prover.circuit_size);
        // info("log circuit size   = ", numeric::get_msb(prover.circuit_size));
#endif
        // Verify Plonk proof
        auto verifier = composer.create_verifier(builder);
        return verifier.verify_proof(proof);
    }

    void add_some_simple_RAM_gates(auto& circuit)
    {
        std::array<uint32_t, 3> ram_values{ circuit.add_variable(5),
                                            circuit.add_variable(10),
                                            circuit.add_variable(20) };

        size_t ram_id = circuit.create_RAM_array(3);

        for (size_t i = 0; i < 3; ++i) {
            circuit.init_RAM_element(ram_id, i, ram_values[i]);
        }

        auto val_idx_1 = circuit.read_RAM_array(ram_id, circuit.add_variable(1));
        auto val_idx_2 = circuit.read_RAM_array(ram_id, circuit.add_variable(2));
        auto val_idx_3 = circuit.read_RAM_array(ram_id, circuit.add_variable(0));

        circuit.create_big_add_gate({
            val_idx_1,
            val_idx_2,
            val_idx_3,
            circuit.zero_idx,
            1,
            1,
            1,
            0,
            -35,
        });
    }

  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }
};

class AcirIntegrationSingleTest : public AcirIntegrationTest, public testing::WithParamInterface<std::string> {};

class AcirIntegrationFoldingTest : public AcirIntegrationTest, public testing::WithParamInterface<std::string> {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }
};

TEST_P(AcirIntegrationSingleTest, DISABLED_ProveAndVerifyProgram)
{
    using Flavor = UltraFlavor;
    // using Flavor = bb::plonk::flavor::Ultra;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = GetParam();
    info("Test: ", test_name);
    acir_format::AcirProgram acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    Builder builder = acir_format::create_circuit<Builder>(acir_program);

    // Construct and verify Honk proof
    if constexpr (IsPlonkFlavor<Flavor>) {
        EXPECT_TRUE(prove_and_verify_plonk<Flavor>(builder));
    } else {
        EXPECT_TRUE(prove_and_verify_honk<Flavor>(builder));
    }
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/994): Run all tests
INSTANTIATE_TEST_SUITE_P(AcirTests,
                         AcirIntegrationSingleTest,
                         testing::Values("1327_concrete_in_generic",
                                         "1_mul",
                                         "2_div",
                                         "3_add",
                                         "4_sub",
                                         "5_over",
                                         "6",
                                         "6_array",
                                         "7",
                                         "7_function",
                                         "aes128_encrypt",
                                         "arithmetic_binary_operations",
                                         "array_dynamic",
                                         "array_dynamic_blackbox_input",
                                         "array_dynamic_main_output",
                                         "array_dynamic_nested_blackbox_input",
                                         "array_eq",
                                         "array_if_cond_simple",
                                         "array_len",
                                         "array_neq",
                                         "array_sort",
                                         "array_to_slice",
                                         "array_to_slice_constant_length",
                                         "assert",
                                         "assert_statement",
                                         "assign_ex",
                                         "bigint",
                                         "bit_and",
                                         "bit_not",
                                         "bit_shifts_comptime",
                                         "bit_shifts_runtime",
                                         "blake3",
                                         "bool_not",
                                         "bool_or",
                                         "break_and_continue",
                                         "brillig_acir_as_brillig",
                                         "brillig_array_eq",
                                         "brillig_array_to_slice",
                                         "brillig_arrays",
                                         "brillig_assert",
                                         "brillig_bit_shifts_runtime",
                                         "brillig_blake2s",
                                         "brillig_blake3",
                                         "brillig_calls",
                                         "brillig_calls_array",
                                         "brillig_calls_conditionals",
                                         "brillig_conditional",
                                         "brillig_cow",
                                         "brillig_cow_assign",
                                         "brillig_cow_regression",
                                         "brillig_ecdsa_secp256k1",
                                         "brillig_ecdsa_secp256r1",
                                         "brillig_embedded_curve",
                                         "brillig_fns_as_values",
                                         "brillig_hash_to_field",
                                         "brillig_identity_function",
                                         "brillig_keccak",
                                         "brillig_loop",
                                         "brillig_nested_arrays",
                                         "brillig_not",
                                         "brillig_oracle",
                                         "brillig_pedersen",
                                         "brillig_recursion",
                                         "brillig_references",
                                         "brillig_schnorr",
                                         "brillig_sha256",
                                         "brillig_signed_cmp",
                                         "brillig_signed_div",
                                         "brillig_slices",
                                         "brillig_to_be_bytes",
                                         "brillig_to_bits",
                                         "brillig_to_bytes_integration",
                                         "brillig_to_le_bytes",
                                         "brillig_top_level",
                                         "brillig_uninitialized_arrays",
                                         "brillig_wrapping",
                                         "cast_bool",
                                         "closures_mut_ref",
                                         "conditional_1",
                                         "conditional_2",
                                         "conditional_regression_421",
                                         "conditional_regression_547",
                                         "conditional_regression_661",
                                         "conditional_regression_short_circuit",
                                         "conditional_regression_underflow",
                                         "custom_entry",
                                         "databus",
                                         "debug_logs",
                                         "diamond_deps_0",
                                         "double_verify_nested_proof",
                                         "double_verify_proof",
                                         "ecdsa_secp256k1",
                                         "ecdsa_secp256r1",
                                         "ecdsa_secp256r1_3x",
                                         "eddsa",
                                         "embedded_curve_ops",
                                         "field_attribute",
                                         "generics",
                                         "global_consts",
                                         "hash_to_field",
                                         "hashmap",
                                         "higher_order_functions",
                                         "if_else_chain",
                                         "import",
                                         "inline_never_basic",
                                         "integer_array_indexing",
                                         "keccak256",
                                         "main_bool_arg",
                                         "main_return",
                                         "merkle_insert",
                                         "missing_closure_env",
                                         "modules",
                                         "modules_more",
                                         "modulus",
                                         "nested_array_dynamic",
                                         "nested_array_dynamic_simple",
                                         "nested_array_in_slice",
                                         "nested_arrays_from_brillig",
                                         "no_predicates_basic",
                                         "no_predicates_brillig",
                                         "no_predicates_numeric_generic_poseidon",
                                         "operator_overloading",
                                         "pedersen_check",
                                         "pedersen_commitment",
                                         "pedersen_hash",
                                         "poseidon_bn254_hash",
                                         "poseidonsponge_x5_254",
                                         "pred_eq",
                                         "prelude",
                                         "references",
                                         "regression",
                                         "regression_2660",
                                         "regression_3051",
                                         "regression_3394",
                                         "regression_3607",
                                         "regression_3889",
                                         "regression_4088",
                                         "regression_4124",
                                         "regression_4202",
                                         "regression_4449",
                                         "regression_4709",
                                         "regression_5045",
                                         "regression_capacity_tracker",
                                         "regression_mem_op_predicate",
                                         "regression_method_cannot_be_found",
                                         "regression_struct_array_conditional",
                                         "schnorr",
                                         "sha256",
                                         "sha2_byte",
                                         "side_effects_constrain_array",
                                         "signed_arithmetic",
                                         "signed_comparison",
                                         "signed_division",
                                         "simple_2d_array",
                                         "simple_add_and_ret_arr",
                                         "simple_array_param",
                                         "simple_bitwise",
                                         "simple_comparison",
                                         "simple_mut",
                                         "simple_not",
                                         "simple_print",
                                         "simple_program_addition",
                                         "simple_radix",
                                         "simple_shield",
                                         "simple_shift_left_right",
                                         "slice_coercion",
                                         "slice_dynamic_index",
                                         "slice_loop",
                                         "slices",
                                         "strings",
                                         "struct",
                                         "struct_array_inputs",
                                         "struct_fields_ordering",
                                         "struct_inputs",
                                         "submodules",
                                         "to_be_bytes",
                                         "to_bytes_consistent",
                                         "to_bytes_integration",
                                         "to_le_bytes",
                                         "trait_as_return_type",
                                         "trait_impl_base_type",
                                         "traits_in_crates_1",
                                         "traits_in_crates_2",
                                         "tuple_inputs",
                                         "tuples",
                                         "type_aliases",
                                         "u128",
                                         "u16_support",
                                         "unconstrained_empty",
                                         "unit_value",
                                         "unsafe_range_constraint",
                                         "witness_compression",
                                         //  "workspace",
                                         //  "workspace_default_member",
                                         "xor"));

TEST_P(AcirIntegrationFoldingTest, DISABLED_ProveAndVerifyProgramStack)
{
    using Flavor = MegaFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = GetParam();
    info("Test: ", test_name);

    auto program_stack = get_program_stack_data_from_test_file(test_name);

    while (!program_stack.empty()) {
        auto program = program_stack.back();

        // Construct a bberg circuit from the acir representation
        auto builder = acir_format::create_circuit<Builder>(program);

        // Construct and verify Honk proof for the individidual circuit
        EXPECT_TRUE(prove_and_verify_honk<Flavor>(builder));

        program_stack.pop_back();
    }
}

INSTANTIATE_TEST_SUITE_P(AcirTests,
                         AcirIntegrationFoldingTest,
                         testing::Values("fold_basic", "fold_basic_nested_call"));

/**
 * @brief A basic test of a circuit generated in noir that makes use of the databus
 *
 */
TEST_F(AcirIntegrationTest, DISABLED_Databus)
{
    using Flavor = MegaFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "databus";
    info("Test: ", test_name);
    acir_format::AcirProgram acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    Builder builder = acir_format::create_circuit<Builder>(acir_program);

    // This prints a summary of the types of gates in the circuit
    builder.blocks.summarize();

    // Construct and verify Honk proof
    EXPECT_TRUE(prove_and_verify_honk<Flavor>(builder));
}

/**
 * @brief Test a program that uses two databus calldata columns
 * @details In addition to checking that a proof of the resulting circuit verfies, check that the specific structure of
 * the calldata/return data interaction in the noir program is reflected in the bberg circuit
 */
TEST_F(AcirIntegrationTest, DISABLED_DatabusTwoCalldata)
{
    using Flavor = MegaFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "databus_two_calldata";
    info("Test: ", test_name);
    acir_format::AcirProgram acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    Builder builder = acir_format::create_circuit<Builder>(acir_program);

    // Check that the databus columns in the builder have been populated as expected
    const auto& calldata = builder.get_calldata();
    const auto& secondary_calldata = builder.get_secondary_calldata();
    const auto& return_data = builder.get_return_data();

    ASSERT(calldata.size() == 4);
    ASSERT(secondary_calldata.size() == 3);
    ASSERT(return_data.size() == 4);

    // Check that return data was computed from the two calldata inputs as expected
    ASSERT_EQ(builder.get_variable(calldata[0]) + builder.get_variable(secondary_calldata[0]),
              builder.get_variable(return_data[0]));
    ASSERT_EQ(builder.get_variable(calldata[1]) + builder.get_variable(secondary_calldata[1]),
              builder.get_variable(return_data[1]));
    ASSERT_EQ(builder.get_variable(calldata[2]) + builder.get_variable(secondary_calldata[2]),
              builder.get_variable(return_data[2]));
    ASSERT_EQ(builder.get_variable(calldata[3]), builder.get_variable(return_data[3]));

    // Ensure that every index of each bus column was read once as expected
    for (size_t idx = 0; idx < calldata.size(); ++idx) {
        ASSERT_EQ(calldata.get_read_count(idx), 1);
    }
    for (size_t idx = 0; idx < secondary_calldata.size(); ++idx) {
        ASSERT_EQ(secondary_calldata.get_read_count(idx), 1);
    }
    for (size_t idx = 0; idx < return_data.size(); ++idx) {
        ASSERT_EQ(return_data.get_read_count(idx), 1);
    }

    // This prints a summary of the types of gates in the circuit
    builder.blocks.summarize();

    // Construct and verify Honk proof
    EXPECT_TRUE(prove_and_verify_honk<Flavor>(builder));
}

/**
 * @brief Ensure that adding gates post-facto to a circuit generated from acir still results in a valid circuit
 * @details This is a pattern required by e.g. ClientIvc which appends recursive verifiers to acir-generated circuits
 *
 */
TEST_F(AcirIntegrationTest, DISABLED_UpdateAcirCircuit)
{
    using Flavor = MegaFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "6_array"; // arbitrary program with RAM gates
    auto acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    Builder circuit = acir_format::create_circuit<Builder>(acir_program);

    EXPECT_TRUE(CircuitChecker::check(circuit));

    // Now append some RAM gates onto the circuit generated from acir and confirm that its still valid. (First, check
    // that the RAM operations constitute a valid independent circuit).
    {
        Builder circuit;
        add_some_simple_RAM_gates(circuit);
        EXPECT_TRUE(CircuitChecker::check(circuit));
        EXPECT_TRUE(prove_and_verify_honk<Flavor>(circuit));
    }

    // Now manually append the simple RAM circuit to the circuit generated from acir
    add_some_simple_RAM_gates(circuit);

    // Confirm that the result is still valid
    EXPECT_TRUE(CircuitChecker::check(circuit));
    EXPECT_TRUE(prove_and_verify_honk<Flavor>(circuit));
}

/**
 * @brief Test recursive honk recursive verification
 *
 */
TEST_F(AcirIntegrationTest, DISABLED_HonkRecursion)
{
    using Flavor = UltraFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = "verify_honk_proof"; // program that recursively verifies a honk proof
    auto acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    Builder circuit = acir_format::create_circuit<Builder>(acir_program);

    EXPECT_TRUE(CircuitChecker::check(circuit));
    EXPECT_TRUE(prove_and_verify_honk<Flavor>(circuit));
}

// /**
//  * @brief Test ClientIVC proof generation and verification given an ivc-inputs msgpack file
//  *
//  */
// TEST_F(AcirIntegrationTest, MsgpackInputs)
// {
//     std::string input_path = "../../../yarn-project/end-to-end/example-app-ivc-inputs-out/"
//                              "ecdsar1+transfer_0_recursions+sponsored_fpc/ivc-inputs.msgpack";

//     PrivateExecutionSteps steps;
//     steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));
//     auto steps_copy = steps;

//     // WORKTODO: its the second multi scalar mul constraint in a set of 4 in token transfer and kernel reset where a
//     // discrepancy arisses. Can debug by simply generating the token transfer circuit in isolation with and without a
//     // witness.

//     // Recomputed the "precomputed" verification keys
//     {
//         TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
//         // size_t step_count = 0;
//         for (auto [program, precomputed_vk, function_name] :
//              zip_view(steps_copy.folding_stack, steps_copy.precomputed_vks, steps_copy.function_names)) {
//             // if (std::strcmp(function_name.c_str(), "Token:transfer") == 0) {
//             info("Function: ", function_name);
//             program.witness = {};
//             auto& ivc_constraints = program.constraints.ivc_recursion_constraints;
//             const acir_format::ProgramMetadata metadata{
//                 .ivc = ivc_constraints.empty() ? nullptr
//                                                : create_mock_ivc_from_constraints(ivc_constraints, trace_settings)
//             };

//             auto circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
//             auto proving_key = std::make_shared<ClientIVC::DeciderProvingKey>(circuit, trace_settings);
//             auto recomputed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->proving_key);

//             // recomputed_vk->compare(precomputed_vk);
//             // if (step_count++ == 1) {
//             //     break;
//             // }
//             // }
//         }
//     }

//     std::shared_ptr<ClientIVC> ivc = steps.accumulate();
//     // ClientIVC::Proof proof = ivc->prove();

//     // // Verify the proof
//     // [[maybe_unused]] bool result = ivc->verify(proof);
//     // EXPECT_TRUE(result);
// }

/**
 * @brief Debug the discrepancy resulting from MSM constraints in the token contract in the "dummy witness" vs real
 * witness case.
 * @details Here's what I know. The token transfer program has 4 multi_scalar_mul constraints. The second of these is
 * handled differently based on the value of has_valid_witness_assignments (in other words whether we are in the dummy
 * witness case used for VK construction or the actual proving scenario). I've traced the discrepancy back to a
 * difference in the output of methed to_grumpkin_point, specifically in the value of
 * input_point.is_point_at_infinity(). For the second of four multi_scalar_mul constraints, it is false in the dummy
 * witness case and true in the real witness case. (The actual circuit discrepancy arises later in the conditional "if
 * (modded_base_point.is_constant() && !base_point.is_point_at_infinity().get_value())" in the constructor for
 * straus_lookup_table).
 *
 * One quirk to note here is that boot_t::get_value() is unique in that it returns (witness_bool ^ witness_inverted)
 * rather than something like variables[witness_index] as other primitives do. This means that if you initialize a
 * bool_t then change its witness_index or the variable pointed to by that witness_index, the value returned by
 * get_value() will not be affected. This seems to be coming into play below because we constuct "bool_ct infinite"
 * based on "input_infinite", which sets the witness_index of infinite to the witness_index of input_infinite. We then
 * update the value pointed to by this witness_index to fr(1) (in the case where we do not have valid witness), but for
 * the reason just explained this will have no effect on the result of infinite.get_value(), which is called later on in
 * straus_lookup_table constructor as explained above.
 *
 * Once I realized this I thought, ok, the solution is to simply initialize infinite AFTER setting
 * "builder.variables[input_infinite.index] = fr(1);". This DOES have the effect of causing infinite.get_value() to
 * return true in the case in question, however it also becomes true in cases where it is NOT true for the valid witness
 * pathway. This suggests to me that perhaps the condition for manually setting the value to fr(1) is not correct. (For
 * example, in the token contract case, this change results in infinite.get_value() == true for both of the first two of
 * four multi_scalar_mul constraints when it is only true for the second of four in the genuine witness case).
 *
 * The root of the issue may be that noir is creating MultiScalarMul constraints with constant coordinates and
 * non-constant is_infinite values. Seems unlikely this is the intended behavior. If it is, I dont think cycle group is
 * correctly generating constraints based on a variable is_infinite value.
 */
TEST_F(AcirIntegrationTest, MultiScalarMulDiscrepancyDebug)
{
    // NOTE: to populate the test inputs at this location, run the following commands:
    //      export  AZTEC_CACHE_COMMIT=origin/master~3
    //      export DOWNLOAD_ONLY=1
    //      yarn-project/end-to-end/bootstrap.sh generate_example_app_ivc_inputs
    std::string input_path = "../../../yarn-project/end-to-end/example-app-ivc-inputs-out/"
                             "ecdsar1+transfer_0_recursions+sponsored_fpc/ivc-inputs.msgpack";

    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    size_t token_idx = 4; // index of the token contract in the set of circuits for the whole flow
    auto precomputed_token_vk = steps.precomputed_vks[token_idx];

    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    // Recompute the "precomputed" verification key (i.e. compute VK with no witness)
    {
        info("RECOMPUTE: \n");
        auto program = steps.folding_stack[token_idx];
        program.witness = {}; // erase the witness to mimmic the "dummy witness" case
        auto& ivc_constraints = program.constraints.ivc_recursion_constraints;
        const acir_format::ProgramMetadata metadata{
            .ivc = ivc_constraints.empty() ? nullptr : create_mock_ivc_from_constraints(ivc_constraints, trace_settings)
        };

        auto circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
        auto proving_key = std::make_shared<ClientIVC::DeciderProvingKey>(circuit, trace_settings);
        auto recomputed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->proving_key);

        // Compare the recomputed vk with the precomputed vk (both constructed using a dummy witness)
        // Note: (We expect these to be equal)
        EXPECT_TRUE(recomputed_vk->compare(precomputed_token_vk));
    }

    // Compute the verification key using the genuine witness
    {
        info("COMPUTE: \n");
        auto program = steps.folding_stack[token_idx];
        auto& ivc_constraints = program.constraints.ivc_recursion_constraints;
        const acir_format::ProgramMetadata metadata{
            .ivc = ivc_constraints.empty() ? nullptr : create_mock_ivc_from_constraints(ivc_constraints, trace_settings)
        };

        auto circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
        auto proving_key = std::make_shared<ClientIVC::DeciderProvingKey>(circuit, trace_settings);
        auto computed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->proving_key);

        // Compare the VK computed using the genuine witness with the VK computed using the dummy witness
        EXPECT_TRUE(computed_vk->compare(precomputed_token_vk));
    }
}
#endif
