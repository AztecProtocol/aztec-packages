#pragma once
/**
 * @file avm_service.hpp
 * @brief The AVM service: what bb-avm-sim serves, and what the in-process FFI (bb-avm-sim.wasm,
 * libbb_avm_sim) makes an instance of.
 */

#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"

#include <atomic>

namespace bb::avm {

/**
 * The token of the simulation running in this process, while one runs, for a SIGUSR1 handler to cancel. Published
 * only once cancel_simulations_on_signal() is set, which bb-avm-sim does: a server process runs one simulation at a
 * time, while an in-process host may run several instances at once and cancels none by signal.
 */
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<avm2::simulation::CancellationToken*> g_active_cancellation_token;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<bool> g_cancel_simulations_on_signal;

} // namespace bb::avm
