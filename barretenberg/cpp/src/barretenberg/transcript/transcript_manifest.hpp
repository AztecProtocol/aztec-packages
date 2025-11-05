// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/log.hpp"
#include <array>
#include <map>
#include <span>
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

    /**
     * @brief Add a single challenge label to the manifest for the given round
     * @details This appends to any existing challenges in the round
     */
    void add_challenge(size_t round, const std::string& label) { manifest[round].challenge_label.push_back(label); }

    /**
     * @brief Add multiple challenge labels to the manifest for the given round
     * @details Convenience overload that loops through the span and appends each label
     */
    void add_challenge(size_t round, std::span<const std::string> labels)
    {
        for (const auto& label : labels) {
            add_challenge(round, label);
        }
    }

    /**
     * @brief Add multiple challenge labels to the manifest for the given round
     * @details Convenience overload for arrays that delegates to span overload
     */
    template <size_t N> void add_challenge(size_t round, const std::array<std::string, N>& labels)
    {
        add_challenge(round, std::span<const std::string>{ labels.data(), labels.size() });
    }

    /**
     * @brief Add multiple challenge labels to the manifest for the given round
     * @details Convenience overload for const char* arrays (e.g., from std::array{"a", "b"})
     */
    template <size_t N> void add_challenge(size_t round, const std::array<const char*, N>& labels)
    {
        for (const auto& label : labels) {
            add_challenge(round, std::string(label));
        }
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
