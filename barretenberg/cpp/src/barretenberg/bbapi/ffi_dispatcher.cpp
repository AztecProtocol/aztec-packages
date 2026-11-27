/**
 * @file ffi_dispatcher.cpp
 * @brief bb's one factory: the context its handlers run over.
 *
 * The generated dispatch is a template over the context type (make_bb_handler<Ctx>), so the
 * generator never learns what that type is. `bb msgpack run` and the in-process FFI both make the
 * service through make_service().
 */
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"

#include "barretenberg/bbapi/generated/bb_dispatch.hpp"

namespace bb::bbapi {

/**
 * @brief One instance of bb: one request context, so stateful command sequences (ChonkStart/Load/Accumulate/Prove)
 * on it share IVC state.
 */
std::unique_ptr<Service> make_service()
{
    return std::make_unique<ContextService<BBApiRequest>>();
}

} // namespace bb::bbapi
