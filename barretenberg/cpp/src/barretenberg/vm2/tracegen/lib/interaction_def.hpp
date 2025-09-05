#pragma once

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_bitwise.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_p_decomposition.hpp"
#include "barretenberg/vm2/tracegen/lib/multi_permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/test_interaction_builder.hpp"

namespace bb::avm2::tracegen {

enum class InteractionType {
    LookupGeneric,
    LookupSequential,
    LookupIntoBitwise,
    LookupIntoIndexedByClk,
    LookupIntoPDecomposition,
    Permutation,
    MultiPermutation,
};

class InteractionDefinition {
  public:
    InteractionDefinition() = default;

    // Old format with InteractionSettings first. TODO: Migrate.
    template <typename InteractionSettings, InteractionType type> InteractionDefinition& add(auto&&... args)
    {
        std::string name = std::string(InteractionSettings::NAME);
        interactions[name] = get_interaction_factory<type, InteractionSettings>(std::forward<decltype(args)>(args)...);
        return *this;
    }

    template <InteractionType type, typename... InteractionSettings> InteractionDefinition& add(auto&&... args)
    {
        std::string name = (std::string(InteractionSettings::NAME) + ...);
        interactions[name] =
            get_interaction_factory<type, InteractionSettings...>(std::forward<decltype(args)>(args)...);
        return *this;
    }

    // Jobs for production.
    std::vector<std::unique_ptr<InteractionBuilderInterface>> get_all_jobs() const;
    // Stricter/more assertive jobs for testing.
    std::vector<std::unique_ptr<InteractionBuilderInterface>> get_all_test_jobs() const;

    std::unique_ptr<InteractionBuilderInterface> get_job(const std::string& interaction_name) const;
    std::unique_ptr<InteractionBuilderInterface> get_test_job(const std::string& interaction_name) const;
    template <typename InteractionSettings> std::unique_ptr<InteractionBuilderInterface> get_test_job() const
    {
        return get_test_job(std::string(InteractionSettings::NAME));
    }

  private:
    using Factory = std::function<std::unique_ptr<InteractionBuilderInterface>(bool strict)>;
    std::unordered_map<std::string, Factory> interactions;

    template <InteractionType type, typename... InteractionSettings>
    static Factory get_interaction_factory(auto&&... args)
    {
        if constexpr (type == InteractionType::LookupGeneric) {
            return [args...](bool) {
                // This class always checks.
                return std::make_unique<LookupIntoDynamicTableGeneric<InteractionSettings...>>(args...);
            };
        } else if constexpr (type == InteractionType::LookupIntoBitwise) {
            return [args...](bool strict) {
                return strict ? std::make_unique<AddChecksToBuilder<LookupIntoBitwise<InteractionSettings...>>>(args...)
                              : std::make_unique<LookupIntoBitwise<InteractionSettings...>>(args...);
            };
        } else if constexpr (type == InteractionType::LookupIntoIndexedByClk) {
            return [args...](bool strict) {
                return strict ? std::make_unique<AddChecksToBuilder<LookupIntoIndexedByClk<InteractionSettings...>>>(
                                    args...)
                              : std::make_unique<LookupIntoIndexedByClk<InteractionSettings...>>(args...);
            };
        } else if constexpr (type == InteractionType::LookupIntoPDecomposition) {
            return [args...](bool strict) {
                return strict ? std::make_unique<AddChecksToBuilder<LookupIntoPDecomposition<InteractionSettings...>>>(
                                    args...)
                              : std::make_unique<LookupIntoPDecomposition<InteractionSettings...>>(args...);
            };
        } else if constexpr (type == InteractionType::LookupSequential) {
            return [args...](bool) {
                // This class always checks.
                return std::make_unique<LookupIntoDynamicTableSequential<InteractionSettings...>>(args...);
            };
        } else if constexpr (type == InteractionType::Permutation) {
            return [args...](bool strict) {
                return strict ? std::make_unique<CheckingPermutationBuilder<InteractionSettings...>>(args...)
                              : std::make_unique<PermutationBuilder<InteractionSettings...>>(args...);
            };
        } else if constexpr (type == InteractionType::MultiPermutation) {
            return
                [args...](bool) { return std::make_unique<MultiPermutationBuilder<InteractionSettings...>>(args...); };
        } else {
            throw std::runtime_error("Interaction type not supported: " + std::to_string(static_cast<int>(type)));
        }
    }

    const Factory& get_job_internal(const std::string& interaction_name) const;
};

} // namespace bb::avm2::tracegen
