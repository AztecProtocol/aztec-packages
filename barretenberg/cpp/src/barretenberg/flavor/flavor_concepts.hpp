#pragma once

// Establish concepts for testing flavor attributes
#include "barretenberg/honk/types/circuit_type.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include <string>
namespace bb {
/**
 * @brief Test whether a type T lies in a list of types ...U.
 *
 * @tparam T The type being tested
 * @tparam U A parameter pack of types being checked against T.
 */
// clang-format off

#ifdef STARKNET_GARAGA_FLAVORS
template <typename T>
concept IsUltraHonk = IsAnyOf<T, UltraFlavor, UltraKeccakFlavor, UltraStarknetFlavor, UltraKeccakZKFlavor, UltraStarknetZKFlavor, UltraZKFlavor, UltraRollupFlavor>;
#else
template <typename T>
concept IsUltraHonk = IsAnyOf<T, UltraFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor, UltraZKFlavor, UltraRollupFlavor>;
#endif
template <typename T>
concept IsUltraOrMegaHonk = IsUltraHonk<T> || IsAnyOf<T, MegaFlavor, MegaZKFlavor>;

template <typename T>
concept IsMegaFlavor = IsAnyOf<T, MegaFlavor, MegaZKFlavor,
                                    MegaRecursiveFlavor_<UltraCircuitBuilder>,
                                    MegaRecursiveFlavor_<MegaCircuitBuilder>,
                                    MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                    MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;

template <typename T>
concept HasDataBus = IsMegaFlavor<T>;

// Whether the Flavor has randomness at the end of its trace to randomise commitments and evaluations of its polynomials
// hence requiring an adjustment to the round univariates via the RowDisablingPolynomial.
// This is not the case for Translator, where randomness resides in different parts of the trace and the locations will
// be reflected via Translator relations.
template <typename T> concept UseRowDisablingPolynomial = !IsAnyOf<T,TranslatorFlavor, TranslatorRecursiveFlavor_<UltraCircuitBuilder>, TranslatorRecursiveFlavor_<MegaCircuitBuilder>>;

template <typename T>
concept HasIPAAccumulator = IsAnyOf<T, UltraRollupFlavor, UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>;

template <typename T>
concept IsRecursiveFlavor = IsAnyOf<T, UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                       UltraRecursiveFlavor_<MegaCircuitBuilder>,
                                       UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                                       UltraZKRecursiveFlavor_<MegaCircuitBuilder>,
                                       UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                                       MegaRecursiveFlavor_<UltraCircuitBuilder>,
                                       MegaRecursiveFlavor_<MegaCircuitBuilder>,
                                       MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                       MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                       TranslatorRecursiveFlavor_<UltraCircuitBuilder>,
                                       TranslatorRecursiveFlavor_<MegaCircuitBuilder>,
                                       ECCVMRecursiveFlavor_<UltraCircuitBuilder>,
                                       AvmRecursiveFlavor_<UltraCircuitBuilder>,
                                       AvmRecursiveFlavor_<MegaCircuitBuilder>,
                                       avm2::AvmRecursiveFlavor_<UltraCircuitBuilder>,
                                       avm2::AvmRecursiveFlavor_<MegaCircuitBuilder>>;

// These concepts are relevant for Sumcheck, where the logic is different for BN254 and Grumpkin Flavors
template <typename T> concept IsGrumpkinFlavor = IsAnyOf<T, ECCVMFlavor, ECCVMRecursiveFlavor_<UltraCircuitBuilder>>;
template <typename T> concept IsECCVMRecursiveFlavor = IsAnyOf<T, ECCVMRecursiveFlavor_<UltraCircuitBuilder>>;

#ifdef STARKNET_GARAGA_FLAVORS
template <typename T> concept IsFoldingFlavor = IsAnyOf<T, UltraFlavor,
                                                           // Note(md): must be here to use oink prover
                                                           UltraKeccakFlavor,
                                                           UltraStarknetFlavor,
                                                           UltraKeccakZKFlavor,
                                                           UltraStarknetZKFlavor,
                                                           UltraRollupFlavor,
                                                           UltraZKFlavor,
                                                           MegaFlavor,
                                                           MegaZKFlavor,
                                                           UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                                           UltraRecursiveFlavor_<MegaCircuitBuilder>,
                                                           UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                                                           MegaRecursiveFlavor_<UltraCircuitBuilder>,
                                                           MegaRecursiveFlavor_<MegaCircuitBuilder>,
                                                            MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                                            MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
#else
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1426): Rename this.
template <typename T> concept IsFoldingFlavor = IsAnyOf<T, UltraFlavor,
                                                           // Note(md): must be here to use oink prover
                                                           UltraKeccakFlavor,
                                                           UltraKeccakZKFlavor,
                                                           UltraRollupFlavor,
                                                           UltraZKFlavor,
                                                           MegaFlavor,
                                                           MegaZKFlavor,
                                                           UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                                           UltraRecursiveFlavor_<MegaCircuitBuilder>,
                                                           UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                                                           UltraZKRecursiveFlavor_<MegaCircuitBuilder>,
                                                           UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                                                           MegaRecursiveFlavor_<UltraCircuitBuilder>,
                                                           MegaRecursiveFlavor_<MegaCircuitBuilder>,
                                                           MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                                           MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
#endif

template <typename Container, typename Element>
inline std::string flavor_get_label(Container&& container, const Element& element) {
    for (auto [label, data] : zip_view(container.get_labels(), container.get_all())) {
        if (&data == &element) {
            return label;
        }
    }
    return "(unknown label)";
}

// clang-format on
} // namespace bb
