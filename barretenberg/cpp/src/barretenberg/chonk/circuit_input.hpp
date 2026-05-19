// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
//
// PXE/bbapi-facing tag + per-kind verification-key surface used to drive Chonk accumulation.
// Lives here (rather than inside `Chonk`) so external producers — PXE, bbapi serializers, ACIR
// tooling — can include just this header without pulling in the rest of the Chonk machinery.

#pragma once

#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

#include <cstdint>
#include <memory>
#include <variant>

namespace bb {

/**
 * @brief Tag identifying which kind of circuit is being accumulated into Chonk.
 *
 * Produced by PXE alongside the circuit and the serialized verification key, then carried through
 * the bb API into Chonk. The tag selects the flavor used for the proof of that circuit:
 *   - App           → MegaAppFlavor (no kernel/app-calldata read-side buses)
 *   - Kernel        → MegaKernelFlavor (no LogDerivLookup, no NonNativeField)
 *   - HidingKernel  → MegaZKFlavor (final circuit, ZK Sumcheck, no folding)
 *
 * Stable on-wire encoding: `uint8_t` value.
 */
enum class CircuitKind : uint8_t {
    App = 0,
    Kernel = 1,
    HidingKernel = 2,
};

/**
 * @brief Verification key paired with `CircuitKind` at the call boundary.
 *
 * Packaged as a variant so the runtime tag and the static VK type are always consistent: a caller
 * passing the wrong VK for the chosen kind gets a `std::bad_variant_access` at the destructuring
 * site instead of silently mis-folding.
 */
using CircuitVerificationKey = std::variant<std::shared_ptr<MegaAppFlavor::VerificationKey>,
                                            std::shared_ptr<MegaKernelFlavor::VerificationKey>,
                                            std::shared_ptr<MegaZKFlavor::VerificationKey>>;

/**
 * @brief Compile-time mapping from `CircuitKind` to its proof flavor. Single source of truth: any
 * caller that needs the flavor for a kind spells it as `flavor_for<kind>` rather than re-naming.
 */
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

/**
 * @brief Compile-time mapping from `CircuitKind` to its in-circuit IO type. Centralised so the
 * App/Kernel/HidingKernel branch only lives here; downstream sites can write `io_for<kind>` (or
 * `io_for<kind, Builder>` for HidingKernel) instead of three nested ternaries.
 *
 * AppIO and KernelIO are fixed to MegaCircuitBuilder by their own definitions; HidingKernelIO is
 * builder-templated so the Builder argument is honoured for that case.
 */
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

/**
 * @brief Dispatch a generic callable on a static `CircuitKind` matching the runtime value.
 *
 * Usage:
 *   dispatch_kind(kind, [&]<CircuitKind K>() { ... use flavor_for<K> / io_for<K> ... });
 *
 * Encapsulates the runtime → compile-time bridge in one place so the App/Kernel/HidingKernel
 * branch only appears here. The lambda receives `K` as a non-type template parameter; from there
 * the caller can spell `flavor_for<K>`, `io_for<K>`, etc.
 */
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
    __builtin_unreachable();
}

} // namespace bb
