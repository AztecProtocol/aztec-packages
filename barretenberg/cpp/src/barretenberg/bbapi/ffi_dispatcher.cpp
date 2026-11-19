/**
 * @file ffi_dispatcher.cpp
 * @brief Names the context bb's handlers run over, for the in-process FFI entry.
 *
 * The generated dispatch is a template over the context type (make_bb_handler<Ctx>), so the
 * generator never learns what that type is. The serve loop gets it from main(), which constructs a
 * BBApiRequest and passes it in. A library has no main(), so this is where the FFI build names it.
 * It is the FFI build's entry point rather than boilerplate, and the barretenberg-rs crate does the
 * same thing one line at a time in its own lib.rs.
 */
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"

#include "barretenberg/bbapi/generated/bb_ffi.hpp"

namespace bb::bbapi {

/**
 * @brief An instance behind the generated in-process FFI entry (bb_ipc_ffi_entry, see bb_ffi.hpp).
 *
 * One request context per instance, so stateful command sequences (ChonkStart/Load/Accumulate/Prove) on it share IVC
 * state, mirroring a serve loop's connection context.
 */
std::unique_ptr<FfiInstance> ipc_ffi_create_instance()
{
    return std::make_unique<FfiContext<BBApiRequest>>();
}

} // namespace bb::bbapi
