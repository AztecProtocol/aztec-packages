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
concept IsUltraHonk = IsAnyOf<T, UltraFlavor, UltraKeccakFlavor, UltraStarknetFlavor, UltraKeccakZKFlavor, UltraStarknetZKFlavor, UltraZKFlavor>;
#else
template <typename T>
concept IsUltraHonk = IsAnyOf<T, UltraFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor, UltraZKFlavor>;
#endif
template <typename T>
concept IsUltraOrMegaHonk = IsUltraHonk<T> || IsAnyOf<T, MegaFlavor,  MegaZKFlavor, MegaAvmFlavor, MultiMegaFlavor, MultiMegaZKFlavor>;

template <typename T>
concept IsMultiMegaFlavor = IsAnyOf<T, MultiMegaFlavor, MultiMegaZKFlavor,
                                       MultiMegaRecursiveFlavor_<UltraCircuitBuilder>,
                                       MultiMegaRecursiveFlavor_<MegaCircuitBuilder>,
                                       MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                       MultiMegaZKRecursiveFlavor_<MegaCircuitBuilder>>;

template <typename T>
concept IsMegaFlavor = IsAnyOf<T, MegaFlavor, MegaZKFlavor, MegaAvmFlavor, MultiMegaFlavor, MultiMegaZKFlavor,
                                    MegaRecursiveFlavor_<UltraCircuitBuilder>,
                                    MegaRecursiveFlavor_<MegaCircuitBuilder>,
                                    MegaAvmRecursiveFlavor_<UltraCircuitBuilder>,
                                    MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                    MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                    MultiMegaRecursiveFlavor_<UltraCircuitBuilder>,
                                    MultiMegaRecursiveFlavor_<MegaCircuitBuilder>,
                                    MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                    MultiMegaZKRecursiveFlavor_<MegaCircuitBuilder>>;

template <typename T>
concept HasDataBus = IsMegaFlavor<T>;

// Whether the Flavor has randomness at the end of its trace to randomise commitments and evaluations of its polynomials
// hence requiring an adjustment to the round univariates via the RowDisablingPolynomial.
// This is not the case for Translator, where randomness resides in different parts of the trace and the locations will
// be reflected via Translator relations.
template <typename T> concept UseRowDisablingPolynomial = !IsAnyOf<T,TranslatorFlavor, TranslatorRecursiveFlavor>;



template <typename T>
concept IsRecursiveFlavor = IsAnyOf<T, UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                       UltraRecursiveFlavor_<MegaCircuitBuilder>,
                                       UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                                       UltraZKRecursiveFlavor_<MegaCircuitBuilder>,
                                       MegaRecursiveFlavor_<UltraCircuitBuilder>,
                                       MegaRecursiveFlavor_<MegaCircuitBuilder>,
                                       MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                       MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                       MegaAvmRecursiveFlavor_<UltraCircuitBuilder>,
                                       MultiMegaRecursiveFlavor_<UltraCircuitBuilder>,
                                       MultiMegaRecursiveFlavor_<MegaCircuitBuilder>,
                                       MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                       MultiMegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                       TranslatorRecursiveFlavor,
                                       ECCVMRecursiveFlavor,
                                       MultilinearBatchingRecursiveFlavor,
                                       avm2::AvmRecursiveFlavor>;

template <typename T>
concept IsKeccakFlavor = IsAnyOf<T, UltraKeccakFlavor, UltraKeccakZKFlavor>;

template <typename T>
concept isMultilinearBatchingFlavor =IsAnyOf<T, MultilinearBatchingFlavor>;

// This concept is relevant for the Sumcheck Prover, where the logic differs between BN254 and Grumpkin
template <typename T> concept IsGrumpkinFlavor = IsAnyOf<T, ECCVMFlavor, ECCVMRecursiveFlavor, SumcheckTestFlavorGrumpkinZK>;
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
