#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/common/log.hpp"

void log_result(const SimulatorResult& result, FuzzerData& fuzzer_data, const std::vector<uint8_t>& bytecode)
{
    info("Reverted: ", result.reverted);
    info("Output: ", result.output);
    info("Bytecode: ", bytecode);
    info("Fuzzer data: ", fuzzer_data);
}

SimulatorResult fuzz(FuzzerData& fuzzer_data)
{
    auto control_flow = ControlFlow(fuzzer_data.instruction_blocks);
    for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instruction);
    }
    auto bytecode = control_flow.build_bytecode(fuzzer_data.return_options);

    auto cpp_simulator = CppSimulator();
    JsSimulator* js_simulator = JsSimulator::getInstance();
    auto result = cpp_simulator.simulate(bytecode, fuzzer_data.calldata);
    auto js_result = js_simulator->simulate(bytecode, fuzzer_data.calldata);

    // If the results does not match
    if (!compare_simulator_results(result, js_result)) {
        log_result(result, fuzzer_data, bytecode);
        throw std::runtime_error("Simulator results are different");
    }
    bool logging_enabled = std::getenv("AVM_FUZZER_LOGGING") != nullptr;
    if (logging_enabled) {
        info("Simulator results match successfully");
        log_result(result, fuzzer_data, bytecode);
    }
    return result;
}
