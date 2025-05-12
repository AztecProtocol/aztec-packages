

#include "group.hpp"
#include <cstddef>
#include <span>

namespace bb::detail {
// Initially in bb's development, generators were computed at runtime, to significant startup cost.
// This was later changed to precompute generators at compile time with constexpr, to very significant (2x) compile time
// This is the third iteration, where we hardcode the generators behind the same constexpr interface,
// providing a test for the generators to ensure they are correct and can easily be re-generated.

// Compile-time string
template <std::size_t N> struct DomainSeparator {
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    constexpr DomainSeparator(const char (&str)[N])
    {
        for (std::size_t i = 0; i < N; ++i) {
            value[i] = str[i];
        }
    }
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    char value[N];
};

// Interface for the generator constants.
// Each 'generators' array is specialized in the precomputed_generators_*_impl.hpp files for each type domain separator,
// type, num, starting index tuple that we have in use.
template <DomainSeparator domain_separator,
          typename AffineElement,
          std::size_t num_generators,
          std::size_t starting_index>
struct PrecomputedGenerators {
    static std::span<const AffineElement> get_generators()
    {
        static auto generators =
            group<typename AffineElement::Fq, typename AffineElement::Fr, typename AffineElement::Params>::
                derive_generators(domain_separator.value, num_generators, starting_index);
        return generators;
    }
};
} // namespace bb::detail

namespace bb {

template <typename Group,
          detail::DomainSeparator domain_separator, // the object itself
          std::size_t num_generators,
          std::size_t starting_index = 0>
inline std::span<const typename Group::affine_element> get_precomputed_generators()
{
    return detail::PrecomputedGenerators<domain_separator,
                                         typename Group::affine_element,
                                         num_generators,
                                         starting_index>::get_generators();
}
} // namespace bb
