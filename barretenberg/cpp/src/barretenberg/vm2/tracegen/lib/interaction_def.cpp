#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

std::vector<std::unique_ptr<InteractionBuilderInterface>> InteractionDefinition::get_all_jobs() const
{
    std::vector<std::unique_ptr<InteractionBuilderInterface>> jobs;
    jobs.reserve(interactions.size());
    for (const auto& [name, factory] : interactions) {
        jobs.push_back(factory(/*strict=*/false));
    }
    return jobs;
}

const InteractionDefinition::Factory& InteractionDefinition::get_job_internal(std::string_view interaction_name) const
{
    auto it = interactions.find(interaction_name);
    if (it == interactions.end()) {
        throw std::runtime_error("Interaction not found: " + std::string(interaction_name));
    }
    return it->second;
}

} // namespace bb::avm2::tracegen
