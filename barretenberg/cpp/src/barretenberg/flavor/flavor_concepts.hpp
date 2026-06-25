#pragma once

// Establish concepts for testing flavor attributes
#include "barretenberg/common/type_traits.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include <cstddef>
#include <string>
#include <type_traits>
namespace bb {
class TranslatorShortMonomialFlavor;

// clang-format off

class ECCVMShortMonomialFlavor;

// Recognise any instantiation of the multilinear batching flavors, independent of NumClaims.
template <typename T> struct IsMultilinearBatchingFlavorImpl : std::false_type {};
template <size_t NumClaims> struct IsMultilinearBatchingFlavorImpl<MultilinearBatchingFlavor_<NumClaims>> : std::true_type {};

template <typename T> struct IsMultilinearBatchingRecursiveFlavorImpl : std::false_type {};
template <size_t NumClaims> struct IsMultilinearBatchingRecursiveFlavorImpl<MultilinearBatchingRecursiveFlavor_<NumClaims>> : std::true_type {};

#ifdef STARKNET_GARAGA_FLAVORS
template <typename T>
concept IsUltraHonk = IsAnyOf<T, UltraFlavor, UltraKeccakFlavor, UltraStarknetFlavor, UltraKeccakZKFlavor, UltraStarknetZKFlavor, UltraZKFlavor>;
#else
template <typename T>
concept IsUltraHonk = IsAnyOf<T, UltraFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor, UltraZKFlavor>;
#endif
template <typename T>
concept IsUltraOrMegaHonk = IsUltraHonk<T> || IsAnyOf<T, MegaFlavor, MegaZKFlavor, MegaAvmFlavor>;

// Whether the Flavor has randomness at the end of its trace to randomise commitments and evaluations of its polynomials
// hence requiring an adjustment to the round univariates via the RowDisablingPolynomial.
// This is not the case for Translator, where randomness resides in different parts of the trace and the locations will
// be reflected via Translator relations.
template <typename T>
concept IsTranslatorFlavor = IsAnyOf<T, TranslatorFlavor, TranslatorShortMonomialFlavor, TranslatorRecursiveFlavor>;
template <typename T> concept UseRowDisablingPolynomial = !IsTranslatorFlavor<T>;



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
                                       MegaAppRecursiveFlavor,
                                       MegaKernelRecursiveFlavor,
                                       TranslatorRecursiveFlavor,
                                       ECCVMRecursiveFlavor,
                                       avm2::AvmRecursiveFlavor> ||
                                       IsMultilinearBatchingRecursiveFlavorImpl<T>::value;

template <typename T>
concept IsKeccakFlavor = IsAnyOf<T, UltraKeccakFlavor, UltraKeccakZKFlavor>;

template <typename T>
concept isMultilinearBatchingFlavor = IsMultilinearBatchingFlavorImpl<T>::value || IsMultilinearBatchingRecursiveFlavorImpl<T>::value;

// This concept is relevant for the Sumcheck Prover, where the logic differs between BN254 and Grumpkin
template <typename T> concept IsGrumpkinFlavor = IsAnyOf<T, ECCVMFlavor, ECCVMShortMonomialFlavor, ECCVMRecursiveFlavor, SumcheckTestFlavorGrumpkinZK>;

// Flavors whose Sumcheck round univariates are committed (sent as commitment + evals at 0,1)
// rather than sent in the clear. The committed data is later verified via Shplemini.
template <typename T> concept UsesCommittedSumcheck = IsGrumpkinFlavor<T>;
template <typename Container, typename Element>
inline std::string flavor_get_label(Container&& container, const Element& element) {
    for (auto [label, data] : zip_view(container.get_labels(), container.get_all())) {
        if (&data == &element) {
            return label;
        }
    }
    return "(unknown label)";
}

// Whether a flavor includes a Gemini masking polynomial in its entities.
// Defaults to Flavor::HasZK; flavors that define HasGeminiMasking = false (e.g., MegaZKFlavor)
// opt out because a separate circuit provides the masking polynomial in the batched PCS.
template <typename Flavor>
constexpr bool flavor_has_gemini_masking()
{
    if constexpr (requires { Flavor::HasGeminiMasking; }) {
        return Flavor::HasGeminiMasking;
    } else {
        return Flavor::HasZK;
    }
}

// clang-format on
} // namespace bb
