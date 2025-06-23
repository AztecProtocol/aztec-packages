#include "barretenberg/client_ivc/client_ivc.hpp"
#ifndef __wasm__
#include "barretenberg/api/exec_pipe.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/private_execution_steps.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "barretenberg/honk/proving_key_inspector.hpp"

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
        BB_ASSERT_EQ(program_stack.size(),
                     static_cast<size_t>(1)); // Otherwise this method will not return full stack data

        return program_stack.back();
    }

    template <class Flavor> bool prove_and_verify_honk(Flavor::CircuitBuilder& builder)
    {
        using Prover = UltraProver_<Flavor>;
        using Verifier = UltraVerifier_<Flavor>;
        using VerificationKey = Flavor::VerificationKey;

        auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
        auto verification_key = std::make_shared<VerificationKey>(proving_key->proving_key);
        Prover prover{ proving_key, verification_key };
#ifdef LOG_SIZES
        builder.blocks.summarize();
        info("num gates          = ", builder.get_estimated_num_finalized_gates());
        info("total circuit size = ", builder.get_estimated_total_circuit_size());
        info("circuit size       = ", prover.proving_key->proving_key.circuit_size);
        info("log circuit size   = ", prover.proving_key->proving_key.log_circuit_size);
#endif
        auto proof = prover.construct_proof();

        // Verify Honk proof
        Verifier verifier{ verification_key };
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
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

class AcirIntegrationSingleTest : public AcirIntegrationTest, public testing::WithParamInterface<std::string> {};

class AcirIntegrationFoldingTest : public AcirIntegrationTest, public testing::WithParamInterface<std::string> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_P(AcirIntegrationSingleTest, DISABLED_ProveAndVerifyProgram)
{
    using Flavor = UltraFlavor;
    using Builder = Flavor::CircuitBuilder;

    std::string test_name = GetParam();
    info("Test: ", test_name);
    acir_format::AcirProgram acir_program = get_program_data_from_test_file(test_name);

    // Construct a bberg circuit from the acir representation
    Builder builder = acir_format::create_circuit<Builder>(acir_program);

    // Construct and verify Honk proof
    EXPECT_TRUE(prove_and_verify_honk<Flavor>(builder));
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/994): Run all tests
INSTANTIATE_TEST_SUITE_P(AcirTests,
                         AcirIntegrationSingleTest,
                         testing::Values("a_1327_concrete_in_generic",
                                         "a_1_mul",
                                         "a_2_div",
                                         "a_3_add",
                                         "a_4_sub",
                                         "a_5_over",
                                         "a_6",
                                         "a_6_array",
                                         "a_7",
                                         "a_7_function",
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

    BB_ASSERT_EQ(calldata.size(), static_cast<size_t>(4));
    BB_ASSERT_EQ(secondary_calldata.size(), static_cast<size_t>(3));
    BB_ASSERT_EQ(return_data.size(), static_cast<size_t>(4));

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

/**
 * @brief Test ClientIVC proof generation and verification given an ivc-inputs msgpack file
 *
 */
TEST_F(AcirIntegrationTest, DISABLED_ClientIVCMsgpackInputs)
{
    // NOTE: to populate the test inputs at this location, run the following commands:
    //      export  AZTEC_CACHE_COMMIT=origin/master~3
    //      export DOWNLOAD_ONLY=1
    //      yarn-project/end-to-end/bootstrap.sh build_bench
    std::string input_path = "../../../yarn-project/end-to-end/example-app-ivc-inputs-out/"
                             "ecdsar1+transfer_0_recursions+sponsored_fpc/ivc-inputs.msgpack";

    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    std::shared_ptr<ClientIVC> ivc = steps.accumulate();
    ClientIVC::Proof proof = ivc->prove();

    EXPECT_TRUE(ivc->verify(proof));
}

/**
 * @brief Check that for a set of programs to be accumulated via CIVC, the verification keys computed with a dummy
 * witness are identical to those computed with the genuine provided witness.
 */
TEST_F(AcirIntegrationTest, DISABLED_DummyWitnessVkConsistency)
{
    std::string input_path = "../../../yarn-project/end-to-end/example-app-ivc-inputs-out/"
                             "ecdsar1+transfer_0_recursions+sponsored_fpc/ivc-inputs.msgpack";

    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path));

    uint256_t recomputed_vk_hash{ 0 };
    uint256_t computed_vk_hash{ 0 };

    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    for (auto [program_in, precomputed_vk, function_name] :
         zip_view(steps.folding_stack, steps.precomputed_vks, steps.function_names)) {

        // Compute the VK using the program constraints but no witness (i.e. mimic the "dummy witness" case)
        {
            auto program = program_in;
            program.witness = {}; // erase the witness to mimmic the "dummy witness" case
            auto& ivc_constraints = program.constraints.ivc_recursion_constraints;
            const acir_format::ProgramMetadata metadata{
                .ivc = ivc_constraints.empty() ? nullptr
                                               : create_mock_ivc_from_constraints(ivc_constraints, trace_settings)
            };

            auto circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
            recomputed_vk_hash = proving_key_inspector::compute_vk_hash<MegaFlavor>(circuit);
        }

        // Compute the verification key using the genuine witness
        {
            auto program = program_in;
            auto& ivc_constraints = program.constraints.ivc_recursion_constraints;
            const acir_format::ProgramMetadata metadata{
                .ivc = ivc_constraints.empty() ? nullptr
                                               : create_mock_ivc_from_constraints(ivc_constraints, trace_settings)
            };

            auto circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
            computed_vk_hash = proving_key_inspector::compute_vk_hash<MegaFlavor>(circuit);
        }

        // Check that the hashes computed from the dummy witness VK and the genuine witness VK are equal
        EXPECT_EQ(recomputed_vk_hash, computed_vk_hash);
        // Check that the VK hashes match the hash of the precomputed VK contained in the msgpack inputs
        EXPECT_EQ(computed_vk_hash, precomputed_vk->hash());
    }
}
#endif
