// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include <algorithm>
#include <cstdint>
#include <vector>

namespace bb {

/**
 * @brief Class to manage pairing point tagging
 * @details This class tracks pairing points and their tags, providing functionality to create new tags, merge tags, and
 * query tag properties. Tags are used to ensure that all the pairing points created in a circuit are aggregated
 * together and set to public (after aggregation).
 */
class PairingPointsTagging {
  private:
    std::vector<uint32_t> pairing_points_tags_;
    uint32_t next_pairing_point_tag_ = 0;
    bool has_pairing_points_ = false;
    bool has_public_pairing_points_ = false;

  public:
    PairingPointsTagging() = default;
    PairingPointsTagging(const PairingPointsTagging& other) = default;
    PairingPointsTagging(PairingPointsTagging&& other) noexcept = default;
    PairingPointsTagging& operator=(const PairingPointsTagging& other) = default;
    PairingPointsTagging& operator=(PairingPointsTagging&& other) noexcept = default;
    ~PairingPointsTagging() = default;

    bool operator==(const PairingPointsTagging& other) const = default;

    /**
     * @brief Create a new unique pairing point tag
     * @return The new tag value
     */
    uint32_t create_pairing_point_tag()
    {
        has_pairing_points_ = true;
        uint32_t new_tag = next_pairing_point_tag_++;
        pairing_points_tags_.emplace_back(
            new_tag); // Each PairingPoints starts with tag equal to the number of PairingPoints created before it
        return new_tag;
    }

    /**
     * @brief Merge two pairing point tags
     * @param tag1 First tag
     * @param tag2 Second tag
     * @details If the tags are different, all instances of tag2 are replaced with tag1. We also check that the pairing
     * points have not been set to public yet.
     */
    void merge_pairing_point_tags(uint32_t tag1_index, uint32_t tag2_index)
    {
        BB_ASSERT(!has_public_pairing_points_,
                  "Cannot merge pairing point tags after pairing points have been set to public.");

        // If different tags, override tag2 with tag1
        uint32_t tag1 = pairing_points_tags_[tag1_index];
        uint32_t tag2 = pairing_points_tags_[tag2_index];

        if (tag1 != tag2) {
            for (auto& tag : pairing_points_tags_) {
                tag = tag == tag2 ? tag1 : tag;
            }
        }
    }

    /**
     * @brief Check if all pairing point tags belong to a single equivalence class
     * @return true if there's only one equivalence class (or no tags at all)
     */
    bool has_single_pairing_point_tag() const
    {
        if (!has_pairing_points_) {
            return true; // No pairing points created
        }
        // Check that there is only one tag
        uint32_t unique_tag = pairing_points_tags_[0];
        return std::ranges::all_of(pairing_points_tags_, [unique_tag](auto const& tag) { return tag == unique_tag; });
    }

    /**
     * @brief Return the number of unique pairing point tags
     * @return The count of unique tags
     */
    uint32_t num_unique_pairing_points() const
    {
        std::vector<uint32_t> unique_tags;
        unique_tags.resize(pairing_points_tags_.size());
        for (auto const& tag : pairing_points_tags_) {
            unique_tags[tag] = 1;
        }
        uint32_t sum = 0;
        for (auto v : unique_tags) {
            sum += v;
        }
        return sum;
    }

    /**
     * @brief Check if any pairing points have been created
     * @return true if pairing points have been created
     */
    bool has_pairing_points() const { return has_pairing_points_; }

    /**
     * @brief Check if pairings points have been set to public
     * @return true if pairing points have been set to public
     */
    bool has_public_pairing_points() const { return has_public_pairing_points_; }

    /**
     * @brief Get the tag for a specific pairing point index
     */
    uint32_t get_tag(uint32_t tag_index) const { return pairing_points_tags_.at(tag_index); }

    /**
     * @brief Record that pairing points have been set to public
     */
    void set_public_pairing_points()
    {
        BB_ASSERT(!has_public_pairing_points_,
                  "Trying to set pairing points to public for a circuit that already has public pairing points.");
        has_public_pairing_points_ = true;
    }
};

} // namespace bb
