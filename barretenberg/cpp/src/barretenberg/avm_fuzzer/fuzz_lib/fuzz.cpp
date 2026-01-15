#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

using namespace bb::avm2::fuzzer;

SimulatorResult fuzz_against_ts_simulator(FuzzerData& fuzzer_data, FuzzerContext& context)
{
    auto control_flow = ControlFlow(fuzzer_data.instruction_blocks);
    for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instruction);
    }
    fuzz_info("Instructions: ", fuzzer_data.instruction_blocks);
    fuzz_info("Calldata: ", fuzzer_data.calldata);

    auto bytecode = control_flow.build_bytecode(fuzzer_data.return_options);
    fuzz_info("Bytecode: ", bytecode);

    auto cpp_simulator = CppSimulator();
    JsSimulator* js_simulator = JsSimulator::getInstance();
    SimulatorResult cpp_result;

    FuzzerWorldStateManager* ws_mgr = FuzzerWorldStateManager::getInstance();

    auto contract_address = context.register_contract_from_bytecode(bytecode);
    FuzzerContractDB contract_db = context.get_contract_db();

    // Create the transaction
    auto tx = create_default_tx(
        contract_address, MSG_SENDER, fuzzer_data.calldata, TRANSACTION_FEE, IS_STATIC_CALL, GAS_LIMIT);

    FF fee_required_da = FF(tx.effective_gas_fees.fee_per_da_gas) * FF(tx.gas_settings.gas_limits.da_gas);
    FF fee_required_l2 = FF(tx.effective_gas_fees.fee_per_l2_gas) * FF(tx.gas_settings.gas_limits.l2_gas);
    ws_mgr->write_fee_payer_balance(tx.fee_payer, fee_required_da + fee_required_l2);

    try {
        ws_mgr->checkpoint();
        cpp_result = cpp_simulator.simulate(*ws_mgr, contract_db, tx, /*public_data_writes=*/{}, /*note_hashes=*/{});
        ws_mgr->revert();
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("CppSimulator threw an exception: ") + e.what());
    }

    ws_mgr->checkpoint();
    auto js_result = js_simulator->simulate(*ws_mgr, contract_db, tx, /*public_data_writes=*/{}, /*note_hashes=*/{});

    context.reset();

    // If the results does not match
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
