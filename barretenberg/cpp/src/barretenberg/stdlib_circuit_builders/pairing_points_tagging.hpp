#pragma once
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
    PairingPointsTagging();
    PairingPointsTagging(const PairingPointsTagging& other);
    PairingPointsTagging(PairingPointsTagging&& other) noexcept;
    PairingPointsTagging& operator=(const PairingPointsTagging& other);
    PairingPointsTagging& operator=(PairingPointsTagging&& other) noexcept;
    ~PairingPointsTagging();

    bool operator==(const PairingPointsTagging& other) const;

    /**
     * @brief Create a new unique pairing point tag
     * @return The new tag value
     */
    uint32_t create_pairing_point_tag();

    /**
     * @brief Merge two pairing point tags
     * @param tag1 First tag
     * @param tag2 Second tag
     * @details If the tags are different, all instances of tag2 are replaced with tag1. We also check that the pairing
     * points have not been set to public yet.
     */
    void merge_pairing_point_tags(uint32_t tag1_index, uint32_t tag2_index);

    /**
     * @brief Check if all pairing point tags belong to a single equivalence class
     * @return true if there's only one equivalence class (or no tags at all)
     */
    bool has_single_pairing_point_tag() const;

    /**
     * @brief Return the number of unique pairing point tags
     * @return The count of unique tags
     */
    uint32_t num_unique_pairing_points() const;

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
    uint32_t get_tag(uint32_t tag_index) const;

    /**
     * @brief Record that pairing points have been set to public
     */
    void set_public_pairing_points();
};

} // namespace bb
