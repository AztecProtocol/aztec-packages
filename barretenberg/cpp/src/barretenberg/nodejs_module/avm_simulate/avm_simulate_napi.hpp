#pragma once

#include <napi.h>

namespace bb::nodejs {

/**
 * @brief NAPI wrapper for the C++ AVM fast simulation.
 *
 * This class provides the bridge between TypeScript and the C++ avm_simulate() function.
 * It handles deserialization of inputs, creation of callback-based contract DB,
 * execution on a worker thread, and serialization of results.
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
     * - info[1]: Object with contract provider callbacks (currently unused, but kept for API consistency):
     *   - getContractInstance(address: string): Promise<Buffer | undefined>
     *   - getContractClass(classId: string): Promise<Buffer | undefined>
     *
     * Returns: Promise<Buffer> containing serialized simulation results
     *
     * @param info NAPI callback info containing arguments
     * @return Napi::Value Promise that resolves with simulation results
     */
    static Napi::Value simulateWithHintedDbs(const Napi::CallbackInfo& info);
};

} // namespace bb::nodejs
