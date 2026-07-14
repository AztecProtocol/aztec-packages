#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

#include <stdexcept>

namespace bb::avm2::tracegen {

std::vector<std::unique_ptr<InteractionBuilderInterface>> InteractionDefinition::get_all_jobs(
    SharedIndexCache& cache) const
{
    std::vector<std::unique_ptr<InteractionBuilderInterface>> jobs;
    jobs.reserve(interactions.size());
    for (const auto& key : std::ranges::views::keys(interactions)) {
        jobs.push_back(get_job(key, cache));
    }
    return jobs;
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> InteractionDefinition::get_all_test_jobs(
    SharedIndexCache& cache) const
{
    std::vector<std::unique_ptr<InteractionBuilderInterface>> jobs;
    jobs.reserve(interactions.size());
    for (const auto& key : std::ranges::views::keys(interactions)) {
        jobs.push_back(get_test_job(key, cache));
    }
    return jobs;
}

std::unique_ptr<InteractionBuilderInterface> InteractionDefinition::get_job(const std::string& interaction_name,
                                                                            SharedIndexCache& cache) const
{
    return get_job_internal(interaction_name)(/*strict=*/false, cache);
}

std::unique_ptr<InteractionBuilderInterface> InteractionDefinition::get_test_job(const std::string& interaction_name,
                                                                                 SharedIndexCache& cache) const
{
    return get_job_internal(interaction_name)(/*strict=*/true, cache);
}

const InteractionDefinition::Factory& InteractionDefinition::get_job_internal(const std::string& interaction_name) const
{
    auto it = interactions.find(interaction_name);
    if (it == interactions.end()) {
        throw std::runtime_error("Interaction not found: " + std::string(interaction_name));
    }
    return it->second;
}

} // namespace bb::avm2::tracegen
