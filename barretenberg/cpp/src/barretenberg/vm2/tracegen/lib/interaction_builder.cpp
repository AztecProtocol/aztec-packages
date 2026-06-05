#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"

#include <algorithm>

#include "barretenberg/vm2/common/set.hpp"

namespace bb::avm2::tracegen {

void order_jobs_by_destination_columns(std::vector<std::unique_ptr<InteractionBuilderInterface>>& jobs)
{
    // Tag each job with whether its destination-columns fingerprint is being seen for the first
    // time. The tag is captured up front so the partition predicate doesn't depend on the
    // unique_ptrs, which the partition implementation may null out via moves.
    unordered_flat_set<size_t> seen_fingerprints;
    std::vector<std::pair<bool, std::unique_ptr<InteractionBuilderInterface>>> tagged;
    tagged.reserve(jobs.size());

    for (auto& job : jobs) {
        auto fp = job->get_destination_columns_fingerprint();
        auto [_, inserted] = seen_fingerprints.insert(fp);
        tagged.emplace_back(inserted, std::move(job));
    }

    // Stable partition: first occurrences come first.
    std::ranges::stable_partition(tagged, [](const auto& t) { return t.first; });

    for (size_t i = 0; i < tagged.size(); ++i) {
        jobs[i] = std::move(tagged[i].second);
    }
}

} // namespace bb::avm2::tracegen
