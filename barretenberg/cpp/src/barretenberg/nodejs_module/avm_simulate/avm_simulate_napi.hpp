#pragma once

#include <napi.h>

namespace bb::nodejs {

/**
 * @brief NAPI wrapper for the C++ AVM simulation.
 *
 * This class provides the bridge between TypeScript and the C++ avm_simulate*() functions.
 * It handles deserialization of inputs, execution on a worker thread, and serialization of results.
 */
class AvmSimulateNapi {
  public:
    /**
     * @brief NAPI function to simulate AVM execution with pre-collected hints
     *
     * Expected arguments:
     * - info[0]: Buffer containing serialized AvmProvingInputs (msgpack)
     *
     * Returns: Promise<Buffer> containing serialized simulation results
     *
     * @param info NAPI callback info containing arguments
     * @return Napi::Value Promise that resolves with simulation results
     */
    static Napi::Value simulateWithHintedDbs(const Napi::CallbackInfo& info);
};

} // namespace bb::nodejs
