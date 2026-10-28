/**
 * @file any_backend.hpp
 * @brief Any backend behind one type, for code that is written once over a
 * service and runs over whichever backend the binary has.
 *
 * A generated <Service>Api is a template over its backend, so code taking an
 * Api names the backend in its type. AnyBackend erases it: an
 * <Service>Api<AnyBackend> can be built over an IpcBackend in a native binary
 * and over a HostCallBackend in a wasm module, and the code using it compiles
 * once for both. The cost is one indirect call per request.
 *
 * Every service's generated directory carries its own copy of this header, so
 * it is guarded by a fixed macro rather than #pragma once: two services in one
 * binary see one definition.
 */
#ifndef IPC_CODEGEN_ANY_BACKEND_HPP
#define IPC_CODEGEN_ANY_BACKEND_HPP

#include "backend.hpp"

#include <concepts>
#include <cstdint>
#include <functional>
#include <memory>
#include <span>
#include <type_traits>
#include <utility>
#include <vector>

namespace ipc_codegen {

class AnyBackend {
public:
  AnyBackend() = default;

  /** Takes ownership of `backend`; copies of this AnyBackend share it. */
  template <Backend B>
    requires(!std::same_as<std::remove_cvref_t<B>, AnyBackend>)
  explicit AnyBackend(B backend)
      : call_([held = std::make_shared<B>(std::move(backend))](
                  std::span<const uint8_t> request) {
          return held->call(request);
        }) {}

  std::vector<uint8_t> call(std::span<const uint8_t> request) {
    return call_(request);
  }

private:
  std::function<std::vector<uint8_t>(std::span<const uint8_t>)> call_;
};

} // namespace ipc_codegen

#endif // IPC_CODEGEN_ANY_BACKEND_HPP
