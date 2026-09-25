// Echo service handlers — echo input fields back in the response. Handlers are
// asynchronous: they produce their result via respond.ok(...) (synchronously
// here; a real service could defer to a thread pool and respond later).
#include "echo_handlers.hpp"

#include <stdexcept>
#include <utility>

namespace echo {

template <>
void handle_bytes(EchoCtx & /*ctx*/, wire::EchoBytes &&cmd,
                  Responder<wire::EchoBytesResponse> respond) {
  respond.ok({.data = std::move(cmd.data)});
}

template <>
void handle_fields(EchoCtx & /*ctx*/, wire::EchoFields &&cmd,
                   Responder<wire::EchoFieldsResponse> respond) {
  respond.ok({.a = cmd.a, .b = cmd.b, .name = std::move(cmd.name)});
}

template <>
void handle_nested(EchoCtx & /*ctx*/, wire::EchoNested &&cmd,
                   Responder<wire::EchoNestedResponse> respond) {
  respond.ok({.inner = std::move(cmd.inner)});
}

template <>
void handle_aliases(EchoCtx & /*ctx*/, wire::EchoAliases &&cmd,
                    Responder<wire::EchoAliasesResponse> respond) {
  respond.ok({.treeId = cmd.treeId,
              .hash = cmd.hash,
              .maybeHash = cmd.maybeHash,
              .hashes = std::move(cmd.hashes)});
}

template <>
void handle_blobs(EchoCtx & /*ctx*/, wire::EchoBlobs &&cmd,
                  Responder<wire::EchoBlobsResponse> respond) {
  respond.ok(
      {.maybeData = std::move(cmd.maybeData), .parts = std::move(cmd.parts)});
}

template <>
void handle_fail(EchoCtx & /*ctx*/, wire::EchoFail &&cmd,
                 Responder<wire::EchoFailResponse> /*respond*/) {
  // Throwing is turned into an error frame by the generated dispatch.
  throw std::runtime_error(cmd.message);
}

} // namespace echo
