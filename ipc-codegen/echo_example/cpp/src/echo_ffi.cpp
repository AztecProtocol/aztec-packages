// The service's half of the generated in-process FFI entry
// (generated/echo_ffi.cpp defines echo_ipc_ffi_entry and calls back here for
// the dispatcher).
#include "generated/echo_ffi.hpp"
#include "echo_handlers.hpp"

namespace echo {

AsyncDispatchHandler &ipc_ffi_dispatcher() {
  static EchoCtx ctx;
  static AsyncDispatchHandler handler = make_echo_handler(ctx);
  return handler;
}

} // namespace echo
