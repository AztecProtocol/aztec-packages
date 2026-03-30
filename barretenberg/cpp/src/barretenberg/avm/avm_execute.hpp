#pragma once
/**
 * @file avm_execute.hpp
 * @brief Umbrella include for AVM command execution.
 *
 * The AvmContext type (previously AvmRequest) is now defined in avm_handlers.cpp
 * as a template specialization detail.
 */

#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"

#include <atomic>

namespace bb::avm {

/** Global cancellation token for the active simulation. SIGUSR1 handler uses this. */
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<avm2::simulation::CancellationToken*> g_active_cancellation_token;

} // namespace bb::avm
