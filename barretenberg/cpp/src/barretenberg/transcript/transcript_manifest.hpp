// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/log.hpp"
#include <map>
#include <string>
#include <vector>
namespace bb {

class TranscriptManifest {
    struct RoundData {
        std::vector<std::string> challenge_label;
        std::vector<std::pair<std::string, size_t>> entries;

        void print()
        {
            for (auto& label : challenge_label) {
                info("\tchallenge: ", label);
            }
            for (auto& entry : entries) {
                info("\telement (", entry.second, "): ", entry.first);
            }
        }

        bool operator==(const RoundData& other) const = default;
    };

    std::map<size_t, RoundData> manifest;

  public:
    void print()
    {
        for (auto& round : manifest) {
            info("Round: ", round.first);
            round.second.print();
        }
    }

    template <typename... Strings> void add_challenge(size_t round, Strings&... labels)
    {
        manifest[round].challenge_label = { labels... };
    }
    template <typename String, size_t NumChallenges>
    void add_challenge(size_t round, std::array<String, NumChallenges> labels)
    {
        auto call_add_challenge = [&] {
            auto call_fn_with_expanded_parameters =
                [&]<size_t... Indices>([[maybe_unused]] std::index_sequence<Indices...>) {
                    return add_challenge(round, std::get<Indices>(labels)...);
                };
            return call_fn_with_expanded_parameters(std::make_index_sequence<NumChallenges>());
        };
        call_add_challenge();
    }

    void add_entry(size_t round, const std::string& element_label, size_t element_size)
    {
        manifest[round].entries.emplace_back(element_label, element_size);
    }

    [[nodiscard]] size_t size() const { return manifest.size(); }

    RoundData operator[](const size_t& round) { return manifest[round]; };

    bool operator==(const TranscriptManifest& other) const = default;
};

} // namespace bb
