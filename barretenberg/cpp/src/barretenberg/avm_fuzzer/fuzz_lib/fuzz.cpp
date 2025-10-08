#include "fuzz.hpp"
#include "control_flow.hpp"

SimulatorResult fuzz(FuzzerData& fuzzer_data)
{
    auto control_flow = ControlFlow(fuzzer_data.instruction_blocks);
    for (const auto& cfg_instruction : fuzzer_data.cfg_instructions) {
        control_flow.process_cfg_instruction(cfg_instruction);
    }
    auto bytecode = control_flow.build_bytecode(fuzzer_data.return_options);

    auto cpp_simulator = CppSimulator();
    auto js_simulator = JsSimulator();
    auto result = cpp_simulator.simulate(bytecode, fuzzer_data.calldata);
    auto js_result = js_simulator.simulate(bytecode, fuzzer_data.calldata);
    if (compare_simulator_results(result, js_result)) {
        // TODO(defkit) log success
    } else {
        std::cout << "Simulator results are different" << std::endl;
        std::cout << "Reverted: " << result.reverted << std::endl;
        for (const auto& output : result.output) {
            std::cout << output << std::endl;
        }
        throw std::runtime_error("Simulator results are different");
    }
    return result;
}
