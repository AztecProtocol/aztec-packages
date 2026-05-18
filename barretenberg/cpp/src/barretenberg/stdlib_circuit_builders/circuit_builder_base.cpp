#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "circuit_builder_base_impl.hpp"
#include "pairing_points_tagging.hpp"

#include <algorithm>

namespace bb {

PairingPointsTagging::PairingPointsTagging() = default;
PairingPointsTagging::PairingPointsTagging(const PairingPointsTagging& other) = default;
PairingPointsTagging::PairingPointsTagging(PairingPointsTagging&& other) noexcept = default;
PairingPointsTagging& PairingPointsTagging::operator=(const PairingPointsTagging& other) = default;
PairingPointsTagging& PairingPointsTagging::operator=(PairingPointsTagging&& other) noexcept = default;
PairingPointsTagging::~PairingPointsTagging() = default;

bool PairingPointsTagging::operator==(const PairingPointsTagging& other) const
{
    return pairing_points_tags_ == other.pairing_points_tags_ &&
           next_pairing_point_tag_ == other.next_pairing_point_tag_ &&
           has_pairing_points_ == other.has_pairing_points_ &&
           has_public_pairing_points_ == other.has_public_pairing_points_;
}

uint32_t PairingPointsTagging::create_pairing_point_tag()
{
    has_pairing_points_ = true;
    uint32_t new_tag = next_pairing_point_tag_++;
    pairing_points_tags_.emplace_back(new_tag);
    return new_tag;
}

void PairingPointsTagging::merge_pairing_point_tags(uint32_t tag1_index, uint32_t tag2_index)
{
    BB_ASSERT(!has_public_pairing_points_,
              "Cannot merge pairing point tags after pairing points have been set to public.");

    uint32_t tag1 = pairing_points_tags_[tag1_index];
    uint32_t tag2 = pairing_points_tags_[tag2_index];

    if (tag1 != tag2) {
        for (auto& tag : pairing_points_tags_) {
            tag = tag == tag2 ? tag1 : tag;
        }
    }
}

bool PairingPointsTagging::has_single_pairing_point_tag() const
{
    if (!has_pairing_points_) {
        return true;
    }
    uint32_t unique_tag = pairing_points_tags_[0];
    return std::ranges::all_of(pairing_points_tags_, [unique_tag](auto const& tag) { return tag == unique_tag; });
}

uint32_t PairingPointsTagging::num_unique_pairing_points() const
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

uint32_t PairingPointsTagging::get_tag(uint32_t tag_index) const
{
    return pairing_points_tags_.at(tag_index);
}

void PairingPointsTagging::set_public_pairing_points()
{
    BB_ASSERT(!has_public_pairing_points_,
              "Trying to set pairing points to public for a circuit that already has public pairing points.");
    has_public_pairing_points_ = true;
}

template class CircuitBuilderBase<bb::fr>;
template class CircuitBuilderBase<grumpkin::fr>;
} // namespace bb
