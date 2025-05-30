#pragma once

#include "barretenberg/common/zip_view.hpp"
#include "group.hpp"
#include <cstddef>
#include <cxxabi.h>
#include <span>
#include <sstream>
namespace bb::detail {
// Each 'generators' array is specialized in the precomputed_generators_*_impl.hpp files.

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
    // If this is being invoked, there is a missing specialization in the _impl.hpp files.
    static constexpr std::span<AffineElement> get_generators()
    {
        // Add dependency on template parameters to force lazy evaluation of the static_assert.
        // This will always evaluate to false if called.
        static_assert(domain_separator.value[0] == '0',
                      "Should not be called! Relevant precomputed_generators_*_impl.hpp file not included OR does not "
                      "have this specialization.");
    };
};
} // namespace bb::detail

namespace bb {

template <typename Group,
          detail::DomainSeparator domain_separator, // the object itself
          std::size_t num_generators,
          std::size_t starting_index = 0>
constexpr std::span<const typename Group::affine_element> get_precomputed_generators()
{
    return detail::PrecomputedGenerators<domain_separator,
                                         typename Group::affine_element,
                                         num_generators,
                                         starting_index>::get_generators();
}

template <typename Group,
          detail::DomainSeparator domain_separator, // the object itself
          std::size_t num_generators,
          std::size_t starting_index = 0>
inline bool check_precomputed_generators()
{
    const auto precomputed = detail::PrecomputedGenerators<domain_separator,
                                                           typename Group::affine_element,
                                                           num_generators,
                                                           starting_index>::get_generators();
    const auto generators = Group::derive_generators(domain_separator.value, num_generators, starting_index);
    if (precomputed.size() != generators.size()) {
        info("Precomputed generators size mismatch");
        return false;
    }
    for (auto [p, g] : zip_view(precomputed, generators)) {
        if (p != g) {
            info("WARNING: Generators do not match precomputed generators! THESE SHOULD GENERALLY NOT CHANGE, "
                 "SOMETHING MAY BE WRONG ON A MORE FUNDAMENTAL LEVEL!");
            info("WARNING: IF YOU REALLY ARE SURE THESE NEED TO BE CHANGED: Include the below code in "
                 "precomputed_generators_*_impl.hpp to hardcode the generators");

            // Demangle the AffineElement type name to get a human-readable string.
            char* demangled_name_c_str =
                abi::__cxa_demangle(typeid(typename Group::affine_element).name(), nullptr, nullptr, nullptr);
            std::string type_name_str =
                demangled_name_c_str != nullptr
                    ? demangled_name_c_str
                    : typeid(typename Group::affine_element).name(); // Fallback if demangling fails

            // Print the header of the class specialization
            info("template <> class PrecomputedGenerators<\"",
                 domain_separator.value, // domain_separator.value is char[N]
                 "\", ",
                 type_name_str,
                 ", ",
                 num_generators,
                 ", ",
                 starting_index,
                 "> {");

            // Print the public section and method signature
            info("with these values for generators: ");
            for (size_t i = 0; i < generators.size(); ++i) {
                std::stringstream x_stream;
                x_stream << generators[i].x;
                std::stringstream y_stream;
                y_stream << generators[i].y;
                const char* suffix = (i == generators.size() - 1) ? "" : ",";
                info("    { uint256_t(\"", x_stream.str(), "\"), uint256_t(\"", y_stream.str(), "\") }", suffix);
            }
            info("    }");
            info("};");

            // Free the memory allocated by abi::__cxa_demangle
            if (demangled_name_c_str != nullptr) {
                std::free(demangled_name_c_str); // NOLINT
            }
            return false;
        }
    }
    return true;
}
} // namespace bb
