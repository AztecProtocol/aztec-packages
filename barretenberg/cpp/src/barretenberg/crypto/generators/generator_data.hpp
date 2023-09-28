#pragma once

#include "barretenberg/common/container.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <array>
#include <map>
#include <optional>

namespace crypto {
template <typename Curve> class generator_data {
  public:
    using Group = typename Curve::Group;
    using AffineElement = typename Curve::AffineElement;
    using GeneratorList = std::vector<AffineElement>;
    using GeneratorView = std::span<AffineElement>;
    static inline constexpr size_t DEFAULT_NUM_GENERATORS = 32;
    static inline constexpr std::string_view DEFAULT_DOMAIN_SEPARATOR = "DEFAULT_DOMAIN_SEPARATOR";
    inline constexpr generator_data() = default;

    /**
     * @brief Precompute a small number of generators at compile time. For small pedersen commitments + pedersen hashes,
     * this prevents us from having to derive generators at runtime
     *
     */
    static inline constexpr std::array<AffineElement, DEFAULT_NUM_GENERATORS> precomputed_generators =
        Group::template derive_generators_secure<DEFAULT_NUM_GENERATORS>(DEFAULT_DOMAIN_SEPARATOR);

    [[nodiscard]] inline GeneratorView get(const size_t num_generators,
                                           const size_t generator_offset = 0,
                                           const std::string_view domain_separator = DEFAULT_DOMAIN_SEPARATOR) const
    {
        const bool is_default_domain = domain_separator == DEFAULT_DOMAIN_SEPARATOR;
        if (is_default_domain && (num_generators + generator_offset) < DEFAULT_NUM_GENERATORS) {
            return GeneratorView(&precomputed_generators[generator_offset], num_generators);
        }

        if (!generator_map.has_value()) {
            generator_map = std::map<std::string, GeneratorList>();
        }
        std::map<std::string, GeneratorList>& map = generator_map.value();

        // Case 2: we want default generators, but more than we precomputed at compile time. If we have not yet copied
        // the default generators into the map, do so.
        if (is_default_domain && !initialized_precomputed_generators) {
            map.insert({ DEFAULT_DOMAIN_SEPARATOR,
                         GeneratorList(precomputed_generators.begin(), precomputed_generators.end()) });
            initialized_precomputed_generators = true;
        }

        // if the generator map does not contain our desired generators, add entry into map
        if (!map.contains(domain_separator)) {
            map.insert({
                domain_separator,
                Group::derive_generators_secure(domain_separator, num_generators + generator_offset, 0),
            });
        }

        GeneratorList& generators = map.at(domain_separator);

        // If the current GeneratorList does not contain enough generators, extend it
        if (num_generators + generator_offset > generators.size()) {
            const size_t num_extra_generators = num_generators + generator_offset - generators.size();
            GeneratorList extended_generators =
                Group::derive_generators_secure(domain_separator, num_extra_generators, generators.size());
            generators.reserve(num_generators + generator_offset);
            std::copy(extended_generators.begin(), extended_generators.end(), std::back_inserter(generators));
        }

        return GeneratorView(&generators[generator_offset], num_generators);
    }

    static inline generator_data* get_default_generators() { return &default_data; }

  private:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static inline constinit generator_data default_data = generator_data();

    mutable bool initialized_precomputed_generators = false;
    mutable std::optional<std::map<std::string, GeneratorList>> generator_map = {};
};

template <typename Curve> struct GeneratorContext {
    size_t offset = 0;
    std::string_view domain_separator = generator_data<Curve>::DEFAULT_DOMAIN_SEPARATOR;
    generator_data<Curve>* generators = generator_data<Curve>::get_default_generators();

    GeneratorContext() = default;
    GeneratorContext(size_t hash_index)
        : offset(hash_index){};
};
} // namespace crypto