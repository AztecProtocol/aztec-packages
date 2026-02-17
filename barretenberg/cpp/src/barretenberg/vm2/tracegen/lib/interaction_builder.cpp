#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"

#include <algorithm>

#include "barretenberg/vm2/common/set.hpp"

namespace bb::avm2::tracegen {

void order_jobs_by_destination_columns(std::vector<std::unique_ptr<InteractionBuilderInterface>>& jobs)
{
    // Identify first occurrences of each fingerprint.
    unordered_flat_set<size_t> seen_fingerprints;
    unordered_flat_set<InteractionBuilderInterface*> first_occurrence_jobs;

    for (const auto& job : jobs) {
        auto fp = job->get_destination_columns_fingerprint();
        auto [_, inserted] = seen_fingerprints.insert(fp);
        if (inserted) {
            first_occurrence_jobs.insert(job.get());
        }
    }

    // Stable partition: first occurrences come first.
    std::ranges::stable_partition(jobs, [&](const auto& job) { return first_occurrence_jobs.contains(job.get()); });
}

} // namespace bb::avm2::tracegen
