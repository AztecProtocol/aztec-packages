#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_ffi.hpp"

namespace bb::bbapi {

/**
 * @brief The dispatcher behind the generated in-process FFI entry (bb_ipc_ffi_entry, see bb_ffi.hpp).
 *
 * One request context for the process so stateful command sequences (ChonkStart/Load/Accumulate/
 * Prove) share IVC state, mirroring a serve loop's single connection context.
 */
AsyncDispatchHandler& ipc_ffi_dispatcher()
{
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static BBApiRequest request;
    static AsyncDispatchHandler handler = make_bb_handler(request);
    return handler;
}

} // namespace bb::bbapi
