#pragma once
#include "barretenberg/common/assert.hpp"
#include <algorithm>
#include <cstdint>
#include <limits>
#include <span>
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
    static constexpr uint32_t UNREGISTERED = std::numeric_limits<uint32_t>::max();

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
        BB_ASSERT(!has_public_pairing_points_,
                  "Cannot create pairing points after pairing points have been set to public.");
        has_pairing_points_ = true;
        uint32_t new_tag = next_pairing_point_tag_++;
        pairing_points_tags_.emplace_back(new_tag); // Each new result starts as its own representative.
        return new_tag;
    }

    /** @brief Reject inputs that were consumed by an earlier aggregation. */
    void validate_aggregation_input(uint32_t tag_index) const
    {
        BB_ASSERT(!has_public_pairing_points_,
                  "Cannot merge pairing point tags after pairing points have been set to public.");
        BB_ASSERT(tag_index == UNREGISTERED ||
                      (tag_index < pairing_points_tags_.size() && pairing_points_tags_[tag_index] == tag_index),
                  "Cannot aggregate stale pairing points.");
    }

    /** @brief Allocate a result tag and transfer the input obligations to it. */
    uint32_t aggregate_pairing_point_tags(std::span<const uint32_t> inputs)
    {
        for (auto input : inputs) {
            validate_aggregation_input(input);
        }
        const auto result = create_pairing_point_tag();
        for (auto& tag : pairing_points_tags_) {
            if (std::ranges::find(inputs, tag) != inputs.end()) {
                tag = result;
            }
        }
        return result;
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
     * @brief Require publication of the final accumulator, or defaults when there are no obligations.
     */
    void set_public_pairing_points(uint32_t tag_index)
    {
        BB_ASSERT(!has_public_pairing_points_,
                  "Trying to set pairing points to public for a circuit that already has public pairing points.");
        BB_ASSERT(tag_index == UNREGISTERED
                      ? pairing_points_tags_.empty()
                      : tag_index < pairing_points_tags_.size() &&
                            std::ranges::all_of(
                                pairing_points_tags_, [tag_index](auto tag) { return tag == tag_index; }),
                  "Only the final pairing accumulator can be published.");
        has_public_pairing_points_ = true;
    }
};

} // namespace bb
