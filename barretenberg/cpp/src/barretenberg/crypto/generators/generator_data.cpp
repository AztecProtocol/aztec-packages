#include "generator_data.hpp"

namespace bb::crypto {

template <typename Curve, int DEFAULT_NUM_GENERATORS>
constexpr std::array<typename Curve::AffineElement, DEFAULT_NUM_GENERATORS> generator_data<
    Curve,
    DEFAULT_NUM_GENERATORS>::make_precomputed_generators()
{
    std::array<AffineElement, DEFAULT_NUM_GENERATORS> output;
    std::vector<AffineElement> res = Group::derive_generators(DEFAULT_DOMAIN_SEPARATOR, DEFAULT_NUM_GENERATORS, 0);
    std::copy(res.begin(), res.end(), output.begin());
    return output;
}

template <typename Curve, int DEFAULT_NUM_GENERATORS>
std::array<typename Curve::AffineElement, DEFAULT_NUM_GENERATORS> const& generator_data<Curve, DEFAULT_NUM_GENERATORS>::
    get_precomputed_generators()
{
    return precomputed_generators;
}

template <typename Curve, int DEFAULT_NUM_GENERATORS>
[[nodiscard]] inline generator_data<Curve, DEFAULT_NUM_GENERATORS>::GeneratorView generator_data<
    Curve,
    DEFAULT_NUM_GENERATORS>::get(const size_t num_generators,
                                 const size_t generator_offset,
                                 const std::string_view domain_separator) const
{
    const bool is_default_domain = domain_separator == DEFAULT_DOMAIN_SEPARATOR;
    if (is_default_domain && (num_generators + generator_offset) < DEFAULT_NUM_GENERATORS) {
        return GeneratorView{ get_precomputed_generators().data() + generator_offset, num_generators };
    }

    if (!generator_map.has_value()) {
        generator_map = std::map<std::string, GeneratorList>();
    }
    std::map<std::string, GeneratorList>& map = generator_map.value();

    // Case 2: we want default generators, but more than we precomputed at compile time. If we have not yet copied
    // the default generators into the map, do so.
    if (is_default_domain && !initialized_precomputed_generators) {
        map.insert({ std::string(DEFAULT_DOMAIN_SEPARATOR),
                     GeneratorList(get_precomputed_generators().begin(), get_precomputed_generators().end()) });
        initialized_precomputed_generators = true;
    }

    // if the generator map does not contain our desired generators, add entry into map
    if (!map.contains(std::string(domain_separator))) {
        map.insert({
            std::string(domain_separator),
            Group::derive_generators(domain_separator, num_generators + generator_offset, 0),
        });
    }

    GeneratorList& generators = map.at(std::string(domain_separator));

    // If the current GeneratorList does not contain enough generators, extend it
    if (num_generators + generator_offset > generators.size()) {
        const size_t num_extra_generators = num_generators + generator_offset - generators.size();
        GeneratorList extended_generators =
            Group::derive_generators(domain_separator, num_extra_generators, generators.size());
        generators.reserve(num_generators + generator_offset);
        std::copy(extended_generators.begin(), extended_generators.end(), std::back_inserter(generators));
    }

    return GeneratorView{ generators.data() + generator_offset, num_generators };
}

template class generator_data<curve::Grumpkin>;

} // namespace bb::crypto
