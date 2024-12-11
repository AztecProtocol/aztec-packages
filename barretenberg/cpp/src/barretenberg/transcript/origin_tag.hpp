#pragma once
/**
 * @file origin_tag.hpp
 * @author Rumata888
 * @brief This file contains part of the logic for the Origin Tag mechanism that tracks the use of in-circuit primitives
 * through tainting (common term meaning adding information that allows to track value origins) them. It then allows us
 * to detect dangerous behaviours in-circuit. The mechanism is only enabled in DEBUG builds
 *
 */
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstddef>
#include <ostream>

#define STANDARD_TESTING_TAGS /*Tags reused in tests*/                                                                 \
    const size_t parent_id = 0;                                                                                        \
    [[maybe_unused]] const auto clear_tag = OriginTag();                                                               \
    const auto submitted_value_origin_tag = OriginTag(                                                                 \
        parent_id, /*round_id=*/0, /*is_submitted=*/true); /*A tag describing a value submitted in the 0th round*/     \
    const auto next_submitted_value_origin_tag = OriginTag(                                                            \
        parent_id, /*round_id=*/1, /*is_submitted=*/true); /*A tag describing a value submitted in the 1st round*/     \
    const auto challenge_origin_tag = OriginTag(                                                                       \
        parent_id, /*round_id=*/0, /*is_submitted=*/false); /*A tag describing a challenge derived in the 0th round*/  \
    const auto next_challenge_tag = OriginTag(                                                                         \
        parent_id, /*round_id=*/1, /*is_submitted=*/false); /*A tag describing a challenge derived in the 1st round*/  \
    const auto first_two_merged_tag =                                                                                  \
        OriginTag(submitted_value_origin_tag,                                                                          \
                  challenge_origin_tag); /*A tag describing a value constructed from values submitted by the prover in \
                                            the 0th round and challenges from the same round */                        \
    const auto first_and_third_merged_tag =                                                                            \
        OriginTag(submitted_value_origin_tag,                                                                          \
                  next_challenge_tag); /* A tag describing a value constructed from values submitted in the 0th round  \
                                          and challenges computed in the 1st round*/                                   \
    const auto first_second_third_merged_tag = OriginTag(                                                              \
        first_two_merged_tag, next_challenge_tag); /* A tag describing a value computed from values submitted in the   \
                                                      0th round and challenges generated in the 0th and 1st round*/    \
    const auto first_to_fourth_merged_tag =                                                                            \
        OriginTag(first_second_third_merged_tag,                                                                       \
                  next_submitted_value_origin_tag); /* A tag describing a value computed from values submitted in the  \
                                 0th and 1st round and challenges generated in the 0th and 1st round*/                 \
    const auto instant_death_tag = []() {                                                                              \
        auto some_tag = OriginTag();                                                                                   \
        some_tag.poison();                                                                                             \
        return some_tag;                                                                                               \
    }(); /* A tag that causes and abort on any arithmetic*/

namespace bb {

void check_child_tags(const uint256_t& tag_a, const uint256_t& tag_b);

#ifndef NDEBUG
struct OriginTag {
    static constexpr size_t CONSTANT = 0;
    // Parent tag is supposed to represent the index of a unique trancript object that generated the value. It uses
    // a concrete index, not bits for now, since we never expect two different indices to be used in the same
    // computation apart from equality assertion
    size_t parent_tag = 0;

    // Child tag specifies which submitted values and challenges have been used to generate this element
    // The lower 128 bits represent using a submitted value from a corresponding round (the shift represents the
    // round) The higher 128 bits represent using a challenge value from an corresponding round (the shift
    // represents the round)
    numeric::uint256_t child_tag = 0;

    // Instant death is used for poisoning values we should never use in arithmetic
    bool instant_death = false;
    // Default Origin Tag has everything set to zero and can't cause any issues
    OriginTag() = default;
    OriginTag(const OriginTag& other) = default;
    OriginTag(OriginTag&& other) = default;
    OriginTag& operator=(const OriginTag& other) = default;
    OriginTag& operator=(OriginTag&& other) noexcept
    {

        parent_tag = other.parent_tag;
        child_tag = other.child_tag;
        instant_death = other.instant_death;
        return *this;
    }
    /**
     * @brief Construct a new Origin Tag object
     *
     * @param parent_index The index of the transcript object
     * @param child_index The round in which we generate/receive the value
     * @param is_submitted If the value is submitted by the prover (not a challenge)
     */
    OriginTag(size_t parent_index, size_t child_index, bool is_submitted = true)
        : parent_tag(parent_index)
        , child_tag((static_cast<uint256_t>(1) << (child_index + (is_submitted ? 0 : 128))))
    {
        ASSERT(child_index < 128);
    }

    /**
     * @brief Construct a new Origin Tag by merging two other Origin Tags
     *
     * @details The function checks for 3 things: 1) The no tag has instant death set, 2) That tags are from the
     * same transcript (same parent tag) or are empty, 3) A complex check for the child tags. After that the child
     * tags are merged and we create a new Origin Tag
     * @param tag_a
     * @param tag_b
     */
    OriginTag(const OriginTag& tag_a, const OriginTag& tag_b)
    {
        if (tag_a.instant_death || tag_b.instant_death) {
            throw_or_abort("Touched an element that should not have been touched");
        }
        if (tag_a.parent_tag != tag_b.parent_tag && (tag_a.parent_tag != 0U) && (tag_b.parent_tag != 0U)) {
            throw_or_abort("Tags from different transcripts were involved in the same computation");
        }
        check_child_tags(tag_a.child_tag, tag_b.child_tag);
        parent_tag = tag_a.parent_tag;
        child_tag = tag_a.child_tag | tag_b.child_tag;
    }

    /**
     * @brief Construct a new Origin Tag from merging several origin tags
     *
     * @details Basically performs the same actions as the constructor from 2 Origin Tags, but iteratively
     *
     * @tparam T
     * @param tag
     * @param rest
     */
    template <class... T> OriginTag(const OriginTag& tag, const T&... rest)
    {
        parent_tag = tag.parent_tag;
        child_tag = tag.child_tag;
        if (tag.instant_death) {
            throw_or_abort("Touched an element that should not have been touched");
        }
        for (const auto& next_tag : { rest... }) {
            if (next_tag.instant_death) {
                throw_or_abort("Touched an element that should not have been touched");
            }
            if (parent_tag != next_tag.parent_tag && (parent_tag != 0U) && (next_tag.parent_tag != 0U)) {
                throw_or_abort("Tags from different transcripts were involved in the same computation");
            }
            check_child_tags(child_tag, next_tag.child_tag);
            child_tag |= next_tag.child_tag;
        }
    }
    ~OriginTag() = default;
    bool operator==(const OriginTag& other) const;
    void poison() { instant_death = true; }
    void unpoison() { instant_death = false; }
    bool is_poisoned() const { return instant_death; }
    bool is_empty() const { return !instant_death && parent_tag == 0 && child_tag == uint256_t(0); };
};
inline std::ostream& operator<<(std::ostream& os, OriginTag const& v)
{
    return os << "{ p_t: " << v.parent_tag << ", ch_t: " << v.child_tag << ", instadeath: " << v.instant_death << " }";
}

#else

struct OriginTag {
    OriginTag() = default;
    OriginTag(const OriginTag& other) = default;
    OriginTag(OriginTag&& other) = default;
    OriginTag& operator=(const OriginTag& other) = default;
    OriginTag& operator=(OriginTag&& other) = default;
    ~OriginTag() = default;

    OriginTag(size_t parent_index [[maybe_unused]],
              size_t child_index [[maybe_unused]],
              bool is_submitted [[maybe_unused]] = true)
    {}

    OriginTag(const OriginTag&, const OriginTag&) {}
    template <class... T> OriginTag(const OriginTag&, const T&...) {}
    bool operator==(const OriginTag& other) const;
    void poison() {}
    void unpoison() {}
    static bool is_poisoned() { return false; }
    static bool is_empty() { return true; };
};
inline std::ostream& operator<<(std::ostream& os, OriginTag const&)
{
    return os << "{ Origin Tag tracking is disabled in release builds }";
}
#endif
} // namespace bb
template <typename T>
concept usesTag = requires(T x, const bb::OriginTag& tag) { x.set_origin_tag(tag); };