#include "barretenberg/avm/avm_ipc_server.hpp"
#include "barretenberg/avm/avm_service.hpp"
#include "barretenberg/avm/generated/avm_ipc_server.hpp"
#include "barretenberg/common/log.hpp"

#include <csignal>
#include <string>
#include <utility>
#include <vector>

namespace bb::avm {

int execute_avm_server(const std::string& input_path, const std::vector<std::string>& host_calls)
{
    ServeOptions options;
    // The simulator pool gives each bb-avm-sim process one connection with one simulation in flight, so the
    // handler runs inline on the reactor thread and responds before the reactor loops.
    options.server.max_shm_clients = 1;
    for (const auto& spec : host_calls) {
        options.host_calls.push_back(ipc_codegen::parse_host_call(spec));
    }

    // Installed before serving: once the socket is up the parent may send SIGUSR1 (cancel the running simulation)
    // at any time, and the default action for an unhandled SIGUSR1 is to terminate the process.
    g_cancel_simulations_on_signal.store(true, std::memory_order_release);
    (void)std::signal(SIGUSR1, [](int /*signal*/) {
        if (auto* token = g_active_cancellation_token.load(std::memory_order_acquire)) {
            token->cancel();
        }
    });

    info("bb-avm-sim serving ", input_path);
    serve(input_path, options);
    return 0;
}

} // namespace bb::avm
