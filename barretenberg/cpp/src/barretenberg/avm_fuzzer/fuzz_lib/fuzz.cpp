#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/common/log.hpp"

using namespace bb::avm2::fuzzer;

void log_result(const SimulatorResult& result)
{
    info("Reverted: ", result.reverted);
    info("Output: ", result.output);
}

SimulatorResult fuzz(FuzzerData& fuzzer_data)
{
    bool logging_enabled = std::getenv("AVM_FUZZER_LOGGING") != nullptr;
    auto control_flow = ControlFlow(fuzzer_data.instruction_blocks);
    for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instruction);
    }
    if (logging_enabled) {
        info("Fuzzer data: ", fuzzer_data);
    }
    auto bytecode = control_flow.build_bytecode(fuzzer_data.return_options);
    if (logging_enabled) {
        info("Bytecode: ", bytecode);
    }

    auto cpp_simulator = CppSimulator();
    JsSimulator* js_simulator = JsSimulator::getInstance();
    SimulatorResult cpp_result;

    FuzzerWorldStateManager* ws_mgr = FuzzerWorldStateManager::getInstance();
    ws_mgr->register_contract_address(CONTRACT_ADDRESS);
    try {
        ws_mgr->checkpoint();
        cpp_result = cpp_simulator.simulate(*ws_mgr, bytecode, fuzzer_data.calldata);
        ws_mgr->revert();
    } catch (const std::exception& e) {
        info("CppSimulator failed with error: ", e.what());
        throw std::runtime_error("Error simulating with CppSimulator");
    }

    ws_mgr->checkpoint();
    auto js_result = js_simulator->simulate(*ws_mgr, bytecode, fuzzer_data.calldata);

    // If the results does not match
    if (!compare_simulator_results(cpp_result, js_result)) {
        info("CppSimulator result: ");
        log_result(cpp_result);
        info("JsSimulator result: ");
        log_result(js_result);
        throw std::runtime_error("Simulator results are different");
    }
    if (logging_enabled) {
        info("Simulator results match successfully");
        log_result(cpp_result);
    }
    return cpp_result;
}
