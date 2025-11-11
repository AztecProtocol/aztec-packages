#pragma once

#include <napi.h>

namespace bb::nodejs {

/**
 * @brief NAPI wrapper for the C++ AVM simulation.
 *
 * This class provides the bridge between TypeScript and the C++ avm_simulate*() functions.
 * It handles deserialization of inputs, execution on a worker thread, and serialization of results.
 *
 * The simulate variation uses real world state and uses callbacks to TS for contract DB.
 *
 * The simulateWithHintedDbs variation uses pre-collected hints for world state and contracts DB.
 * There are no callbacks to TS or direct calls to world state.
 */
class AvmSimulateNapi {
  public:
    /**
     * @brief NAPI function to simulate AVM execution
     *
     * Expected arguments:
     * - info[0]: Buffer containing serialized AvmFastSimulationInputs (msgpack)
     * - info[1]: Object with contract provider callbacks:
     *   - getContractInstance(address: string): Promise<Buffer | undefined>
     *   - getContractClass(classId: string): Promise<Buffer | undefined>
     * - info[2]: External WorldState handle (pointer to world_state::WorldState)
     *
     * Returns: Promise<Buffer> containing serialized simulation results
     *
     * @param info NAPI callback info containing arguments
     * @return Napi::Value Promise that resolves with simulation results
     */
    static Napi::Value simulate(const Napi::CallbackInfo& info);
    /**
     * @brief NAPI function to simulate AVM execution with pre-collected hints
     *
     * Expected arguments:
     * - info[0]: Buffer containing serialized AvmProvingInputs (msgpack)
     *
     * @param info NAPI callback info containing arguments
     * @return Napi::Value Promise that resolves with simulation results
     */
    static Napi::Value simulateWithHintedDbs(const Napi::CallbackInfo& info);
};

} // namespace bb::nodejs
