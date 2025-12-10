#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/common/log.hpp"

using namespace bb::avm2::fuzzer;

SimulatorResult fuzz(FuzzerData& fuzzer_data)
{
    auto control_flow = ControlFlow(fuzzer_data.instruction_blocks);
    for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instruction);
    }
    fuzz_info("Fuzzer data: ", fuzzer_data);

    auto bytecode = control_flow.build_bytecode(fuzzer_data.return_options);
    fuzz_info("Bytecode: ", bytecode);

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
        throw std::runtime_error(std::string("CppSimulator threw an exception: ") + e.what());
    }

    ws_mgr->checkpoint();
    auto js_result = js_simulator->simulate(*ws_mgr, bytecode, fuzzer_data.calldata);

    // If the results does not match
    if (!compare_simulator_results(cpp_result, js_result)) {
        vinfo("CppSimulator ", cpp_result);
        vinfo("JsSimulator  ", js_result);
        throw std::runtime_error("Simulator results are different");
    }
    fuzz_info("Simulator results match successfully");
    fuzz_info("CppSimulator ", cpp_result);
    fuzz_info("JsSimulator  ", js_result);
    return cpp_result;
}
