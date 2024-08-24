#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstddef>

namespace bb {

struct OriginTag {
    static constexpr size_t CONSTANT = 0;
    // Parent tag uses a concrete index, not bits for now, since we never expect the values to meet
    size_t parent_tag;
    numeric::uint256_t child_tag;
    OriginTag() = default;
    OriginTag(const OriginTag& other) = default;
    OriginTag& operator=(const OriginTag& other) = default;
    OriginTag& operator=(OriginTag&& other) noexcept
    {
        parent_tag = other.parent_tag;
        child_tag = other.child_tag;
        return *this;
    }
    OriginTag(size_t parent_index, size_t child_index, bool is_submitted = true)
        : parent_tag(parent_index)
        , child_tag((static_cast<uint256_t>(1) << (child_index + (is_submitted ? 0 : 128))))
    {
        ASSERT(child_index < 128);
    }

    OriginTag(const OriginTag& tag_a, const OriginTag& tag_b)
    {
        if (tag_a.parent_tag != tag_b.parent_tag && (tag_a.parent_tag != 0U) && (tag_b.parent_tag != 0U)) {
            throw_or_abort("Tags from different transcripts were involved in the same computation");
        }
        parent_tag = tag_a.parent_tag;
        child_tag = tag_a.child_tag | tag_b.child_tag;
    }
    template <class... T> OriginTag(const OriginTag& tag, const T&... rest)
    {
        parent_tag = tag.parent_tag;
        child_tag = tag.child_tag;
        for (const auto& next_tag : { rest... }) {
            if (parent_tag != next_tag.parent_tag && (parent_tag != 0U) && (next_tag.parent_tag != 0U)) {
                throw_or_abort("Tags from different transcripts were involved in the same computation");
            }
            child_tag |= next_tag.child_tag;
        }
    }
};
} // namespace bb
template <typename T>
concept usesTag = requires(T x, const bb::OriginTag& tag) { x.set_origin_tag(tag); };