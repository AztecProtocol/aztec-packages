#pragma once

#include <memory>
#include <vector>

namespace bb::avm2::tracegen {

// Helper function to create a vector of unique_ptrs.
template <typename R, typename... Ts> std::vector<R> make_jobs(Ts&&... args)
{
    std::vector<R> jobs;
    jobs.reserve(sizeof...(Ts));
    (jobs.push_back(std::move(args)), ...);
    return jobs;
}

} // namespace bb::avm2::tracegen
