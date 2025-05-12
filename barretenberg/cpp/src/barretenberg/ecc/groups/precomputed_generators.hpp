#pragma once

#include "group.hpp"
#include <cstddef>
#include <span>
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
    // static std::span<const AffineElement> get_generators()
    // {
    //     // Fallback - if the generators are not defined, we will use the runtime generator function.
    //     // However, we warn clearly that this will be slower, and print the code that should be used to hardcode the
    //     // generators.
    //     static auto generators =
    //         group<typename AffineElement::Fq, typename AffineElement::Fr, typename AffineElement::Params>::
    //             derive_generators(domain_separator.value, num_generators, starting_index);

    //     /**
    //      We print of the form:
    //     template <> class PrecomputedGenerators<"pedersen_hash_length", curve::Grumpkin::AffineElement, 1, 0> {
    //         public:
    //             static std::span<const curve::Grumpkin::AffineElement> get_generators()
    //             {
    //                 // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    //                 static const curve::Grumpkin::AffineElement generators[1] = {
    //                     { { 17073107942961762201ULL, 2852173614226397194ULL, 13623573872280674322ULL,
    //     749552761154020099ULL }, { 5412407584077200717ULL, 8019793462306515478ULL, 16737294919534112339ULL,
    //     1803602698978470415ULL } },
    //                 };
    //                 return { generators, 1 };
    //             }
    //         };
    //     };
    //      */
    //     info("WARNING: Generators not precomputed, using runtime generator function.");
    //     info("WARNING: This is only provided for development/testing purposes.");
    //     info("WARNING: Include the below code in precomputed_generators_*_impl.hpp to hardcode the generators for "
    //          "performance.");

    //     // Demangle the AffineElement type name to get a human-readable string.
    //     char* demangled_name_c_str = abi::__cxa_demangle(typeid(AffineElement).name(), nullptr, nullptr, nullptr);
    //     std::string type_name_str = demangled_name_c_str != nullptr
    //                                     ? demangled_name_c_str
    //                                     : typeid(AffineElement).name(); // Fallback if demangling fails

    //     // Print the header of the class specialization
    //     info("template <> class PrecomputedGenerators<\"",
    //          domain_separator.value, // domain_separator.value is char[N]
    //          "\", ",
    //          type_name_str,
    //          ", ",
    //          num_generators,
    //          ", ",
    //          starting_index,
    //          "> {");

    //     // Print the public section and method signature
    //     info("public:");
    //     info("    static std::span<const ", type_name_str, "> get_generators()");
    //     info("    {");

    //     // Print the NOLINT comment and the static array declaration
    //     info("        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)");
    //     info("        static const ", type_name_str, " generators[", num_generators, "] = {");
    //     for (size_t i = 0; i < generators.size(); ++i) {
    //         // X coordinates part
    //         info("            { { ",
    //              generators[i].x.data[0],
    //              "ULL, ",
    //              generators[i].x.data[1],
    //              "ULL, ",
    //              generators[i].x.data[2],
    //              "ULL, ",
    //              generators[i].x.data[3],
    //              "ULL },");

    //         // Y coordinates part. Add a comma after the element if it's not the last one.
    //         if (i < generators.size() - 1) {
    //             info("              { ",
    //                  generators[i].y.data[0],
    //                  "ULL, ",
    //                  generators[i].y.data[1],
    //                  "ULL, ",
    //                  generators[i].y.data[2],
    //                  "ULL, ",
    //                  generators[i].y.data[3],
    //                  "ULL } },");
    //         } else {
    //             info("              { ",
    //                  generators[i].y.data[0],
    //                  "ULL, ",
    //                  generators[i].y.data[1],
    //                  "ULL, ",
    //                  generators[i].y.data[2],
    //                  "ULL, ",
    //                  generators[i].y.data[3],
    //                  "ULL } }");
    //         }
    //     }

    //     info("        };");
    //     info("        return { generators, ", num_generators, " };");
    //     info("    }");
    //     info("};");

    //     // Free the memory allocated by abi::__cxa_demangle
    //     if (demangled_name_c_str != nullptr) {
    //         std::free(demangled_name_c_str); // NOLINT
    //     }
    //     abort(); // Abort the program to indicate that the generators were not precomputed.
    //     return generators;
    // }
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
    for (size_t i = 0; i < precomputed.size(); ++i) {
        if (precomputed[i] != generators[i]) {
            info("Precomputed generators mismatch at index ", i);

            info("WARNING: Generators do not match precomputed generators! THESE SHOULD GENERALLY NOT CHANGE, "
                 "SOMETHING MAY BE WRONG ON A MORE FUNDAMENTAL LEVEL!");
            info("WARNING: IF YOU REALLY ARE SURE THESE NEED TO BE CHANGE: Include the below code in "
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
            info("public:");
            info("    static std::span<const ", type_name_str, "> get_generators()");
            info("    {");

            // Print the NOLINT comment and the static array declaration
            info("        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)");
            info("        static const ", type_name_str, " generators[", num_generators, "] = {");
            for (size_t i = 0; i < generators.size(); ++i) {
                // X coordinates part
                info("            { { ",
                     generators[i].x.data[0],
                     "ULL, ",
                     generators[i].x.data[1],
                     "ULL, ",
                     generators[i].x.data[2],
                     "ULL, ",
                     generators[i].x.data[3],
                     "ULL },");

                // Y coordinates part. Add a comma after the element if it's not the last one.
                if (i < generators.size() - 1) {
                    info("              { ",
                         generators[i].y.data[0],
                         "ULL, ",
                         generators[i].y.data[1],
                         "ULL, ",
                         generators[i].y.data[2],
                         "ULL, ",
                         generators[i].y.data[3],
                         "ULL } },");
                } else {
                    info("              { ",
                         generators[i].y.data[0],
                         "ULL, ",
                         generators[i].y.data[1],
                         "ULL, ",
                         generators[i].y.data[2],
                         "ULL, ",
                         generators[i].y.data[3],
                         "ULL } }");
                }
            }

            info("        };");
            info("        return { generators, ", num_generators, " };");
            info("    }");
            info("};");

            // Free the memory allocated by abi::__cxa_demangle
            if (demangled_name_c_str != nullptr) {
                std::free(demangled_name_c_str); // NOLINT
            }
            abort(); // Abort the program to indicate that the generators were not precomputed.
            return false;
        }
    }
    return true;
}
} // namespace bb
