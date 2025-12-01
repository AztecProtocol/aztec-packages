#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/common/log.hpp"

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
    try {
        cpp_result = cpp_simulator.simulate(bytecode, fuzzer_data.calldata);
    } catch (const std::exception& e) {
        std::cout << "Error simulating with CppSimulator: " << e.what() << std::endl;
        throw std::runtime_error("Error simulating with CppSimulator");
    }

    auto js_result = js_simulator->simulate(bytecode, fuzzer_data.calldata);

    // If the results does not match
    if (!compare_simulator_results(cpp_result, js_result)) {
        // we restart the js simulator, becuase it works on the same worldstate for every run
        // while cpp simulator works on a new worldstate for every run
        JsSimulator::restart_simulator();
        js_simulator = JsSimulator::getInstance();
        js_result = js_simulator->simulate(bytecode, fuzzer_data.calldata);
        // if the bug is persistent on "cleared" worldstate, we throw an error
        if (!compare_simulator_results(cpp_result, js_result)) {
            info("CppSimulator result: ");
            log_result(cpp_result);
            info("JsSimulator result: ");
            log_result(js_result);
            throw std::runtime_error("Simulator results are different");
        }
    }
    if (logging_enabled) {
        info("Simulator results match successfully");
        log_result(cpp_result);
    }
    return cpp_result;
}
