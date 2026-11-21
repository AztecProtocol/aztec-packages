// Echo service handlers — echo input fields back in the response. Handlers are
// asynchronous: they produce their result via respond.ok(...) (synchronously
// here; a real service could defer to a thread pool and respond later).
#include "echo_handlers.hpp"

#include "generated/echo_async_client.hpp"
#include "generated/ipc_codegen/async.hpp"

#include <exception>
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

namespace {

// Calls "peer" with one more byte and one hop fewer, and answers with what
// comes back. On an asynchronous instance the co_await suspends this
// coroutine until the host delivers the answer, and the instance takes other
// requests meanwhile (the next hop among them, when "peer" leads back here).
ipc_codegen::Async<void> relay(wire::EchoRelay cmd,
                               Responder<wire::EchoRelayResponse> respond) {
  EchoAsyncApi<ipc_codegen::AsyncHostCall> peer(
      ipc_codegen::AsyncHostCall("peer"));
  cmd.data.push_back(static_cast<uint8_t>(cmd.hops));
  try {
    respond.ok(co_await peer.relay({.data = std::move(cmd.data),
                                    .hops = cmd.hops - 1}));
  } catch (const std::exception &e) {
    respond.error(e.what());
  }
}

} // namespace

template <>
void handle_relay(EchoCtx & /*ctx*/, wire::EchoRelay &&cmd,
                  Responder<wire::EchoRelayResponse> respond) {
  if (cmd.hops == 0) {
    respond.ok({.data = std::move(cmd.data)});
    return;
  }
  ipc_codegen::spawn(relay(std::move(cmd), std::move(respond)));
}

} // namespace echo
