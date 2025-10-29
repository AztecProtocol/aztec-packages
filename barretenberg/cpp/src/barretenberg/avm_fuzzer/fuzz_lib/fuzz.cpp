#include "barretenberg/avm_fuzzer/fuzz_lib/fuzz.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"

void log_result(const SimulatorResult& result)
{
    std::cout << "Reverted: " << result.reverted << std::endl;
    for (const auto& output : result.output) {
        std::cout << output << std::endl;
    }
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
    if (compare_simulator_results(result, js_result)) {
        // TODO(defkit) log success
    } else {
        std::cout << "Simulator results are different" << std::endl;
        std::cout << "CPP result:" << std::endl;
        log_result(result);
        std::cout << "JS result:" << std::endl;
        log_result(js_result);
        throw std::runtime_error("Simulator results are different");
    }
    return result;
}
