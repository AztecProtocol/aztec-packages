#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"

#include <cstdint>
#include <string>
#include <unordered_set>
#include <vector>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"
#include "barretenberg/avm_fuzzer/fuzzer_comparison_helper.hpp"
#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/tx_data.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

using namespace bb::avm2::fuzzer;
using namespace bb::avm2::simulation;
using namespace bb::world_state;

void setup_fuzzer_state(FuzzerWorldStateManager& ws_mgr, FuzzerContractDB& contract_db, const FuzzerTxData& tx_data)
{
    // Add all contract classes and instances to the contract DB
    for (size_t i = 0; i < tx_data.contract_classes.size(); ++i) {
        const auto& contract_class = tx_data.contract_classes[i];
        const auto& contract_instance = tx_data.contract_instances[i];
        auto contract_address = tx_data.contract_addresses[i];
        contract_db.add_contract_class(contract_class.id, contract_class);
        contract_db.add_contract_instance(contract_address, contract_instance);
    }

    // Register the de-duplicated set of contract addresses to the world state (in insertion order)
    std::unordered_set<AztecAddress> seen_addresses;
    for (const auto& addr : tx_data.contract_addresses) {
        if (seen_addresses.insert(addr).second) {
            fuzz_info("Registering contract address in world state: ", addr);
            ws_mgr.register_contract_address(addr);
        }
    }
}

void fund_fee_payer(FuzzerWorldStateManager& ws_mgr, const Tx& tx)
{
    // Compute fee from gas limits and max fees per gas (upper bound on fee)
    FF fee_required_da = FF(tx.gas_settings.gas_limits.da_gas) * FF(tx.gas_settings.max_fees_per_gas.fee_per_da_gas);
    FF fee_required_l2 = FF(tx.gas_settings.gas_limits.l2_gas) * FF(tx.gas_settings.max_fees_per_gas.fee_per_l2_gas);

    // Fund fee payer with required fee
    ws_mgr.write_fee_payer_balance(tx.fee_payer, fee_required_da + fee_required_l2);
}

/// @brief Fuzz CPP vs JS simulator with a full transaction containing multiple enqueued calls
/// @param tx_data The transaction data containing multiple enqueued calls
/// @returns The simulator result if the results are the same
/// @throws An exception if the simulator results are different
SimulatorResult fuzz_tx(FuzzerWorldStateManager& ws_mgr, FuzzerContractDB& contract_db, FuzzerTxData& tx_data)
{
    // Run simulators
    auto cpp_simulator = CppSimulator();
    JsSimulator* js_simulator = JsSimulator::getInstance();
    SimulatorResult cpp_result;

    try {
        ws_mgr.checkpoint();
        cpp_result = cpp_simulator.simulate(ws_mgr, contract_db, tx_data.tx);
        ws_mgr.revert();
    } catch (const std::exception& e) {
        fuzz_info("CppSimulator threw an exception: ", e.what());
        cpp_result = SimulatorResult{
            .reverted = true,
            .output = {},
            .end_tree_snapshots = TreeSnapshots(),
            .revert_reason = e.what(),
        };
        ws_mgr.revert();
    }

    ws_mgr.checkpoint();
    auto js_result = js_simulator->simulate(ws_mgr, contract_db, tx_data.tx);

    // If the results do not match
    if (!compare_simulator_results(cpp_result, js_result)) {
        fuzz_info("CppSimulator ", cpp_result);
        fuzz_info("JsSimulator  ", js_result);
        throw std::runtime_error("Simulator results are different");
    }
    fuzz_info("Simulator results match successfully");
    fuzz_info("CppSimulator ", cpp_result);
    fuzz_info("JsSimulator  ", js_result);

    return cpp_result;
}

/// @brief Run the prover fuzzer: fast simulation, hint collection, comparison, and check_circuit
/// @param ws_mgr The world state manager (should already be forked)
/// @param contract_db The contract database
/// @param tx_data The transaction data
/// @returns 0 on success
/// @throws An exception if simulation results differ or check_circuit fails
int fuzz_prover(FuzzerWorldStateManager& ws_mgr, FuzzerContractDB& contract_db, FuzzerTxData& tx_data)
{
    ProtocolContracts protocol_contracts{};
    WorldState& ws = ws_mgr.get_world_state();
    WorldStateRevision ws_rev = ws_mgr.get_current_revision();
    AvmSimulationHelper helper;

    // Reset stats for this iteration
    bb::avm2::Stats::get().reset();

    const PublicSimulatorConfig sim_fast_config{
        .skip_fee_enforcement = false,
        .collect_call_metadata = true,
        .collect_public_inputs = true,
    };

    const PublicSimulatorConfig sim_hint_config{
        .skip_fee_enforcement = false,
        .collect_call_metadata = true,
        .collect_hints = true,
        .collect_public_inputs = true,
    };

    // 1. Run simulate_fast_with_existing_ws
    // It is the only one that may throw, so we wrap it in try-catch. If it fails, we do not proceed
    TxSimulationResult fast_result;
    try {
        ws_mgr.checkpoint();
        fast_result = AVM_TRACK_TIME_V(
            "fuzzer/simulate_fast",
            helper.simulate_fast_with_existing_ws(
                contract_db, ws_rev, ws, sim_fast_config, tx_data.tx, tx_data.global_variables, protocol_contracts));
        ws_mgr.revert();
    } catch (const std::exception& e) {
        ws_mgr.revert();
        fuzz_info("simulate_fast_with_existing_ws threw an exception: ", e.what());
        return 0;
    }

    // 2. Run simulate_for_hint_collection
    ws_mgr.checkpoint();
    TxSimulationResult hint_result = AVM_TRACK_TIME_V(
        "fuzzer/simulate_hints",
        helper.simulate_for_hint_collection(
            contract_db, ws_rev, ws, sim_hint_config, tx_data.tx, tx_data.global_variables, protocol_contracts));
    ws_mgr.revert();

    // 2a. Construct proving inputs from hint result
    bb::avm2::AvmProvingInputs proving_inputs{
        .public_inputs = hint_result.public_inputs.value(),
        .hints = hint_result.hints.value(),
    };

    // 3. (optional) Simulate Fast with hinted db
    TxSimulationResult sim_fast_hinted_result =
        helper.simulate_fast_with_hinted_dbs(proving_inputs.hints, sim_fast_config);

    // 4. Compare results from all 3 simulations
    bool result = compare_cpp_simulator_results({ fast_result, hint_result, sim_fast_hinted_result });
    BB_ASSERT(result,
              "Simulation results do not match between simulate_fast, simulate_for_hint_collection, "
              "and simulate_fast_with_hinted_dbs");

    // 5. Run check_circuit (skip in coverage builds since it's slow and not needed for coverage measurement)

#ifndef COVERAGE_AVM
    avm2::AvmAPI avm_api;
    bool check_circuit_result = avm_api.check_circuit(proving_inputs);
    BB_ASSERT(check_circuit_result,
              "check_circuit returned false in fuzzer with no exception, this indicates a failure");
#else
    // In coverage builds, run simulate_for_witgen instead of check_circuit
    // This gives us coverage the the event and tracegen code paths without the overhead of check_circuit
    vinfo("Running simulate_for_witgen in coverage build (skipping check_circuit)");
    avm2::AvmSimulationHelper simulation_helper;
    simulation_helper.simulate_for_witgen(proving_inputs.hints);
#endif

    return 0;
}

// Initialize FuzzerTxData with sensible defaults
FuzzerTxData create_default_tx_data(std::mt19937_64& rng, const FuzzerContext& context)
{
    FuzzerData fuzzer_data = generate_fuzzer_data(rng, context);
    FuzzerTxData tx_data = {
        .input_programs = { fuzzer_data },
        .tx = create_default_tx(MSG_SENDER, MSG_SENDER, {}, TRANSACTION_FEE, IS_STATIC_CALL, GAS_LIMIT),
        .global_variables = { .chain_id = CHAIN_ID,
                              .version = VERSION,
                              .block_number = BLOCK_NUMBER,
                              .slot_number = SLOT_NUMBER,
                              .timestamp = TIMESTAMP,
                              .coinbase = COINBASE,
                              .fee_recipient = FEE_RECIPIENT,
                              .gas_fees =
                                  GasFees{ .fee_per_da_gas = FEE_PER_DA_GAS, .fee_per_l2_gas = FEE_PER_L2_GAS } },
        .protocol_contracts = {},
    };
    return tx_data;
}

FuzzerTxData create_default_tx_data(const FuzzerContext& context)
{
    std::mt19937_64 rng(0);
    return create_default_tx_data(rng, context);
}

ContractArtifacts build_bytecode_and_artifacts(FuzzerData& fuzzer_data)
{
    fuzz_info("Building bytecode from fuzzer data: ", fuzzer_data.instruction_blocks);
    auto control_flow = ControlFlow(fuzzer_data.instruction_blocks);
    for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instruction);
    }
    auto bytecode = control_flow.build_bytecode(fuzzer_data.return_options);

    auto bytecode_commitment = compute_public_bytecode_commitment(bytecode);
    auto class_id = compute_contract_class_id(/*artifact_hash=*/0, /*private_fn_root=*/0, bytecode_commitment);
    ContractClass contract_class{
        .id = class_id,
        .artifact_hash = 0,
        .private_functions_root = 0,
        .packed_bytecode = bytecode,
    };
    ContractInstance contract_instance{
        .salt = 0,
        .deployer = MSG_SENDER,
        .current_contract_class_id = class_id, // Initial and current are the same
        .original_contract_class_id = class_id,
        .public_keys = {
            .nullifier_key = { 0, 0 },
            .incoming_viewing_key = grumpkin::g1::element::one(),
            .outgoing_viewing_key = { 0, 0 },
            .tagging_key = { 0, 0 },
        },
    };
    return { bytecode, contract_class, contract_instance };
}

size_t mutate_tx_data(FuzzerContext& context,
                      uint8_t* serialized_fuzzer_data,
                      size_t serialized_fuzzer_data_size,
                      size_t max_size,
                      unsigned int seed)
{
    auto rng = std::mt19937_64(seed);
    FuzzerTxData tx_data;
    try {
        msgpack::unpack((reinterpret_cast<const char*>(serialized_fuzzer_data)), serialized_fuzzer_data_size)
            .get()
            .convert(tx_data);
    } catch (const std::exception&) {
        fuzz_info("Failed to deserialize input in CustomMutator, creating default FuzzerTxData");
        tx_data = create_default_tx_data(rng, context);
    }

    // Mutate the fuzzer data multiple times for better bytecode variety
    auto num_mutations = std::uniform_int_distribution<uint8_t>(1, 5)(rng);
    for (uint8_t i = 0; i < num_mutations; i++) {
        mutate_fuzzer_data_vec(context, tx_data.input_programs, rng, 64);
    }

    // Build up bytecodes, contract classes and instances from the fuzzer data
    tx_data.contract_classes.clear();
    tx_data.contract_instances.clear();
    tx_data.contract_addresses.clear();
    std::vector<AztecAddress> contract_addresses;

    for (auto& fuzzer_data : tx_data.input_programs) {
        const auto [bytecode, contract_class, contract_instance] = build_bytecode_and_artifacts(fuzzer_data);

        auto contract_address = simulation::compute_contract_address(contract_instance);
        contract_addresses.push_back(contract_address);

        tx_data.contract_classes.push_back(contract_class);
        tx_data.contract_instances.push_back(contract_instance);
    }

    tx_data.contract_addresses = contract_addresses;

    // Ensure all enqueued calls have valid contract addresses (not placeholders)
    // We may add more advanced mutation to change contract addresses later, right now we just ensure they are valid
    auto idx_dist = std::uniform_int_distribution<size_t>(0, contract_addresses.size() - 1);
    if (!contract_addresses.empty()) {
        for (auto& call : tx_data.tx.setup_enqueued_calls) {
            call.request.contract_address = contract_addresses[idx_dist(rng)];
        }
        for (auto& call : tx_data.tx.app_logic_enqueued_calls) {
            call.request.contract_address = contract_addresses[idx_dist(rng)];
        }
    }

    // Select mutation type (weighted against bytecode mutations) -- todo
    auto mutation_type = std::uniform_int_distribution<uint8_t>(0, 0);
    TxDataMutationType mutation_choice = static_cast<TxDataMutationType>(mutation_type(rng));

    switch (mutation_choice) {
    case TxDataMutationType::TxMutation:
        mutate_tx(tx_data.tx, contract_addresses, rng);
        break;
        // case TxDataMutationType::BytecodeMutation:
        //     // todo: Maybe here we can do some direct mutations on the bytecode
        //     // Mutations here are likely to cause immediate failure
        //     break;
        // case TxDataMutationType::ContractClassMutation:
        //     // Mutations here are likely to cause immediate failure
        //     break;
        // case TxDataMutationType::ContractInstanceMutation:
        //     // Mutations here are likely to cause immediate failure
        //     break;
        // case TxDataMutationType::GlobalVariablesMutation:
        //     break;
        // case TxDataMutationType::ProtocolContractsMutation:
        // break;
    }

    // todo: do we need to ensure this or are should we able to process 0 enqueued calls?
    // Ensure at least 1 app_logic enqueued call exists (mutations may have deleted all)
    if (tx_data.tx.app_logic_enqueued_calls.empty() && !contract_addresses.empty()) {
        auto idx = std::uniform_int_distribution<size_t>(0, contract_addresses.size() - 1)(rng);
        std::vector<FF> calldata = {};
        auto calldata_hash = compute_calldata_hash(calldata);
        tx_data.tx.app_logic_enqueued_calls.push_back(
            PublicCallRequestWithCalldata{ .request = PublicCallRequest{ .msg_sender = MSG_SENDER,
                                                                         .contract_address = contract_addresses[idx],
                                                                         .is_static_call = false,
                                                                         .calldata_hash = calldata_hash },
                                           .calldata = calldata });
    }
    auto [mutated_serialized_fuzzer_data, mutated_serialized_fuzzer_data_size] = msgpack_encode_buffer(tx_data);
    if (mutated_serialized_fuzzer_data_size > max_size) {
        delete[] mutated_serialized_fuzzer_data;
        return 0; // Can't fit mutated data in buffer, skip this mutation
    }
    memcpy(serialized_fuzzer_data, mutated_serialized_fuzzer_data, mutated_serialized_fuzzer_data_size);
    delete[] mutated_serialized_fuzzer_data;

    return mutated_serialized_fuzzer_data_size;
}
