// Names the context the echo handlers run over, for the in-process FFI entry.
//
// The generated dispatch is a template over the context type
// (make_echo_handler<Ctx>), so the generator never learns what that type is.
// The server gets it from main(), which constructs an EchoCtx and passes it to
// echo::serve(). A library has no main(), so this is where the FFI build names
// it: the same job lib.rs does for the Rust example with export_echo_ffi!.
// Each instance the FFI creates gets a fresh EchoCtx.
#include "echo_handlers.hpp"

#include "generated/echo_ffi.hpp"

namespace echo {

std::unique_ptr<FfiInstance> ipc_ffi_create_instance() {
  return std::make_unique<FfiContext<EchoCtx>>();
}

} // namespace echo
