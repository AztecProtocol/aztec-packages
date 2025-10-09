#include "fuzz.hpp"

void fuzz(FuzzerData& fuzzer_data)
{
    auto control_flow = ControlFlow();
    control_flow.add_instructions(fuzzer_data.instructions);
    auto bytecode = control_flow.build_bytecode();

    auto cpp_simulator = CppSimulator();
    auto js_simulator = JsSimulator();
    auto result = cpp_simulator.simulate(bytecode, fuzzer_data.calldata);
    auto js_result = js_simulator.simulate(bytecode, fuzzer_data.calldata);
    if (compare_simulator_results(result, js_result)) {
        std::cout << "Simulator results are the same" << std::endl;
        for (const auto& output : result.output) {
            std::cout << output << std::endl;
        }
    } else {
        std::cout << "Simulator results are different" << std::endl;
    }
}
