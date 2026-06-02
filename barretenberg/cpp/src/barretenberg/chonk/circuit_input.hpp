// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include <msgpack/adaptor/define_decl.hpp>

#include <cstdint>
#include <memory>
#include <ostream>
#include <string>
#include <utility>
#include <variant>

namespace bb {

enum class CircuitKind : uint8_t {
    App = 0,
    Kernel = 1,
    HidingKernel = 2,
};

inline std::ostream& operator<<(std::ostream& os, CircuitKind kind)
{
    switch (kind) {
    case CircuitKind::App:
        return os << "app";
    case CircuitKind::Kernel:
        return os << "kernel";
    case CircuitKind::HidingKernel:
        return os << "hiding";
    }
    return os << "unknown(" << static_cast<int>(kind) << ")";
}

using CircuitVerificationKey = std::variant<std::shared_ptr<MegaAppFlavor::VerificationKey>,
                                            std::shared_ptr<MegaKernelFlavor::VerificationKey>,
                                            std::shared_ptr<MegaZKFlavor::VerificationKey>>;

using StdlibCircuitVKAndHash = std::variant<std::shared_ptr<MegaAppRecursiveFlavor::VKAndHash>,
                                            std::shared_ptr<MegaKernelRecursiveFlavor::VKAndHash>>;

template <CircuitKind K> struct flavor_for_impl;
template <> struct flavor_for_impl<CircuitKind::App> {
    using type = MegaAppFlavor;
};
template <> struct flavor_for_impl<CircuitKind::Kernel> {
    using type = MegaKernelFlavor;
};
template <> struct flavor_for_impl<CircuitKind::HidingKernel> {
    using type = MegaZKFlavor;
};
template <CircuitKind K> using flavor_for = typename flavor_for_impl<K>::type;

template <CircuitKind K, typename Builder> struct io_for_impl;
template <typename Builder> struct io_for_impl<CircuitKind::App, Builder> {
    using type = stdlib::recursion::honk::AppIO;
};
template <typename Builder> struct io_for_impl<CircuitKind::Kernel, Builder> {
    using type = stdlib::recursion::honk::KernelIO;
};
template <typename Builder> struct io_for_impl<CircuitKind::HidingKernel, Builder> {
    using type = stdlib::recursion::honk::HidingKernelIO<Builder>;
};
template <CircuitKind K, typename Builder = MegaCircuitBuilder> using io_for = typename io_for_impl<K, Builder>::type;

template <typename F> constexpr decltype(auto) dispatch_kind(CircuitKind kind, F&& f)
{
    switch (kind) {
    case CircuitKind::App:
        return std::forward<F>(f).template operator()<CircuitKind::App>();
    case CircuitKind::Kernel:
        return std::forward<F>(f).template operator()<CircuitKind::Kernel>();
    case CircuitKind::HidingKernel:
        return std::forward<F>(f).template operator()<CircuitKind::HidingKernel>();
    }
    // Not a BB_ASSERT/unreachable: MSGPACK_ADD_ENUM does an unchecked cast, so a kind byte >= 3 from
    // an old/external/crafted msgpack yields an invalid enum. The VK paths (compute_chonk_vk /
    // check_precomputed_chonk_vk) dispatch on the raw wire kind with no other guard, so this must
    // throw in release/WASM rather than jump past the switch (UB).
    throw_or_abort("dispatch_kind: invalid CircuitKind " + std::to_string(static_cast<int>(kind)));
}

} // namespace bb

MSGPACK_ADD_ENUM(bb::CircuitKind)
