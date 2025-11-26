#pragma once

#include <vector>

#include "barretenberg/avm_fuzzer/common/process.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/execution.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2;

struct SimulatorResult {
    bool reverted;
    std::vector<FF> output;
};

class Simulator {
  public:
    virtual ~Simulator() = default;
    Simulator(const Simulator&) = delete;
    Simulator& operator=(const Simulator&) = delete;
    Simulator(Simulator&&) = delete;
    Simulator& operator=(Simulator&&) = delete;
    Simulator() = default;
    virtual SimulatorResult simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata) = 0;
};

/// @brief uses barretenberg/vm2 to simulate the bytecode
class CppSimulator : public Simulator {
  public:
    SimulatorResult simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata) override;
};

/// @brief uses the yarn-project/simulator to simulate the bytecode
/// Singleton, because initializing the simulator is expensive
class JsSimulator : public Simulator {
  protected:
    static JsSimulator* instance;
    std::string simulator_path;
    JsSimulator(std::string& simulator_path);
    Process process;

    void restart_simulator_process();

  public:
    JsSimulator(JsSimulator& other) = delete;
    void operator=(const JsSimulator&) = delete;
    JsSimulator(JsSimulator&&) = delete;
    JsSimulator& operator=(JsSimulator&&) = delete;
    ~JsSimulator() = default;

    static JsSimulator* getInstance();
    static void initialize(std::string& simulator_path);
    static void restart_simulator();

    SimulatorResult simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata) override;
};

bool compare_simulator_results(const SimulatorResult& result1, const SimulatorResult& result2);
