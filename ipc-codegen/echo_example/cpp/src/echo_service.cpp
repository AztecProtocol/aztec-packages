// The echo service's one factory: the context its handlers run over. The
// generated dispatch is a template over that type (make_echo_handler<Ctx>),
// so the generator never learns it; the server (echo::serve) and the
// in-process FFI (echo_ipc_ffi_create) both make the service through this.
// It is the same job lib.rs does for the Rust example with export_echo_ffi!.
#include "echo_handlers.hpp"

#include "generated/echo_dispatch.hpp"

namespace echo {

std::unique_ptr<Service> make_service() {
  return std::make_unique<ContextService<EchoCtx>>();
}

} // namespace echo
