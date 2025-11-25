// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
/**
 * @file origin_tag.hpp
 * @author Rumata888
 * @brief This file contains part of the logic for the Origin Tag mechanism that tracks the use of in-circuit primitives
 * through tainting (common term meaning adding information that allows to track value origins) them. It then allows us
 * to detect dangerous behaviours in-circuit. The mechanism is only enabled in DEBUG builds
 *
 */
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstddef>
#include <iterator>
#include <ostream>
#include <type_traits>
#include <vector>

// Trait to detect if a type is iterable
template <typename T, typename = void> struct is_iterable : std::false_type {};

// this gets used only when we can call std::begin() and std::end() on that type
template <typename T>
struct is_iterable<T, std::void_t<decltype(std::begin(std::declval<T&>())), decltype(std::end(std::declval<T&>()))>>
    : std::true_type {};

template <typename T> constexpr bool is_iterable_v = is_iterable<T>::value;

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

void check_round_provenance(const uint256_t& provenance_a, const uint256_t& provenance_b);
#ifndef AZTEC_NO_ORIGIN_TAGS
struct OriginTag {

    static constexpr size_t CONSTANT = static_cast<size_t>(-1);
    static constexpr size_t FREE_WITNESS = static_cast<size_t>(-2);
    // transcript_index represents the index of a unique transcript object that generated the value. It uses
    // a concrete index, not bits for now, since we never expect two different indices to be used in the same
    // computation apart from equality assertion
    // transcript_index is set to CONSTANT if the value is just a constant
    // transcript_index is set to FREE_WITNESS if the value is a free witness (not a constant and not from the
    // transcript)
    size_t transcript_index = CONSTANT;

    // round_provenance specifies which submitted values and challenges have been used to generate this element
    // The lower 128 bits represent using a submitted value from a corresponding round (the shift represents the
    // round) The higher 128 bits represent using a challenge value from an corresponding round (the shift
    // represents the round)
    numeric::uint256_t round_provenance = numeric::uint256_t(0);

    // Instant death is used for poisoning values we should never use in arithmetic
    bool instant_death = false;

    // Default Origin Tag has everything set to zero and can't cause any issues
    OriginTag() = default;
    OriginTag(const OriginTag& other) = default;
    OriginTag(OriginTag&& other) = default;
    OriginTag& operator=(const OriginTag& other) = default;
    OriginTag& operator=(OriginTag&& other) noexcept
    {

        transcript_index = other.transcript_index;
        round_provenance = other.round_provenance;
        instant_death = other.instant_death;
        return *this;
    }
    /**
     * @brief Construct a new Origin Tag object
     *
     * @param transcript_idx The index of the transcript object
     * @param round_number The round in which we generate/receive the value
     * @param is_submitted If the value is submitted by the prover (not a challenge)
     */
    OriginTag(size_t transcript_idx, size_t round_number, bool is_submitted = true)
        : transcript_index(transcript_idx)
        , round_provenance((static_cast<uint256_t>(1) << (round_number + (is_submitted ? 0 : 128))))
    {
        BB_ASSERT_LT(round_number, 128U);
    }

    /**
     * @brief Construct a new Origin Tag by merging two other Origin Tags
     *
     * @details The function checks for 3 things: 1) The no tag has instant death set, 2) That tags are from the
     * same transcript (same transcript_index) or are empty, 3) A complex check for the round_provenance. After that the
     * round_provenance values are merged and we create a new Origin Tag
     * @param tag_a
     * @param tag_b
     */
    OriginTag(const OriginTag& tag_a, const OriginTag& tag_b);

    /**
     * @brief Construct a new Origin Tag from merging several origin tags
     *
     * @details Basically performs the same actions as the constructor from 2 Origin Tags, but iteratively
     *
     * @tparam T
     * @param tag
     * @param rest
     */
    template <class... T>
    OriginTag(const OriginTag& tag, const T&... rest)
        : transcript_index(tag.transcript_index)
        , round_provenance(tag.round_provenance)
        , instant_death(tag.instant_death)
    {

        OriginTag merged_tag = *this;
        for (const auto& next_tag : { rest... }) {
            merged_tag = OriginTag(merged_tag, next_tag);
        }
        *this = merged_tag;
    }
    ~OriginTag() = default;
    bool operator==(const OriginTag& other) const;
    void poison() { instant_death = true; }
    void unpoison() { instant_death = false; }
    bool is_poisoned() const { return instant_death; }
    bool is_empty() const { return !instant_death && transcript_index == CONSTANT; };

    bool is_free_witness() const { return transcript_index == FREE_WITNESS; }
    void set_free_witness()
    {
        transcript_index = FREE_WITNESS;
        round_provenance = 0;
    }
    void unset_free_witness()
    {
        transcript_index = CONSTANT;
        round_provenance = numeric::uint256_t(0);
    }

    /**
     * @brief Clear the round_provenance to address round provenance false positives.
     */
    void clear_round_provenance() { round_provenance = numeric::uint256_t(0); }
};
inline std::ostream& operator<<(std::ostream& os, OriginTag const& v)
{
    return os << "{ transcript_idx: " << v.transcript_index << ", round_prov: " << v.round_provenance
              << ", instadeath: " << v.instant_death << " }";
}

#else

struct OriginTag {
    OriginTag() = default;
    OriginTag(const OriginTag& other) = default;
    OriginTag(OriginTag&& other) = default;
    OriginTag& operator=(const OriginTag& other) = default;
    OriginTag& operator=(OriginTag&& other) = default;
    ~OriginTag() = default;

    OriginTag(size_t transcript_idx [[maybe_unused]],
              size_t round_number [[maybe_unused]],
              bool is_submitted [[maybe_unused]] = true)
    {}

    OriginTag(const OriginTag&, const OriginTag&) {}
    template <class... T> OriginTag(const OriginTag&, const T&...) {}
    bool operator==(const OriginTag& other) const;
    void poison() {}
    void unpoison() {}
    static bool is_poisoned() { return false; }
    static bool is_empty() { return true; };
    bool is_free_witness() const { return false; }
    void set_free_witness() {}
    void unset_free_witness() {}
    void clear_round_provenance() {}
};
inline std::ostream& operator<<(std::ostream& os, OriginTag const&)
{
    return os << "{ Origin Tag tracking is disabled in release builds }";
}
#endif

// Helper functions for working with origin tags
/**
 * @brief Assigns an origin tag to an element or all elements in an iterable container
 * @details Only operates when in_circuit is true
 * @tparam in_circuit Whether the transcript is in-circuit mode
 * @tparam T The type of the element to tag (can be a single element or container)
 * @param elem The element or container to assign the tag to
 * @param tag The origin tag to assign
 */
template <bool in_circuit, typename T> inline void assign_origin_tag(T& elem, const OriginTag& tag)
{
    if constexpr (in_circuit) {
        if constexpr (is_iterable_v<T>) {
            for (auto& e : elem) {
                e.set_origin_tag(tag);
            }
        } else {
            elem.set_origin_tag(tag);
        }
    }
}

/**
 * @brief Checks that an element or all elements in an iterable container have the expected origin tag
 * @details Only operates when in_circuit is true
 * @tparam in_circuit Whether the transcript is in-circuit mode
 * @tparam T The type of the element to check (can be a single element or container)
 * @param elem The element or container to check
 * @param tag The expected origin tag
 */
template <bool in_circuit, typename T> inline void check_origin_tag(T& elem, const OriginTag& tag)
{
    if constexpr (in_circuit) {
        if constexpr (is_iterable_v<T>) {
            for (auto& e : elem) {
                BB_ASSERT(e.get_origin_tag() == tag);
            };
        } else {
            BB_ASSERT(elem.get_origin_tag() == tag);
        }
    }
}

/**
 * @brief Unsets free witness tags on all elements in a vector
 * @details Only operates when in_circuit is true
 * @tparam in_circuit Whether the transcript is in-circuit mode
 * @tparam DataType The type of the elements in the vector
 * @param input The vector of elements to process
 */
template <bool in_circuit, typename DataType> inline void unset_free_witness_tags(std::vector<DataType>& input)
{
    if constexpr (in_circuit) {
        for (auto& entry : input) {
            entry.unset_free_witness_tag();
        }
    }
}

/**
 * @brief Tag a component with a given origin tag and serialize it to field elements.
 *
 * @tparam in_circuit Whether the transcript is in-circuit mode
 * @tparam Codec The codec to use for serialization (provides DataType and serialize_to_fields)
 * @tparam T The type of the component to tag and serialize
 * @param component The component to tag and serialize
 * @param tag The origin tag to assign
 * @return std::vector<typename Codec::DataType> Serialized field elements
 */
template <bool in_circuit, typename Codec, typename T>
inline std::vector<typename Codec::DataType> tag_and_serialize(const T& component, const OriginTag& tag)
{
    if constexpr (in_circuit) {
        assign_origin_tag<in_circuit>(const_cast<T&>(component), tag);
    }
    // Serialize to field elements
    return Codec::serialize_to_fields(component);
}

/**
 * @brief Extract origin tag context from a transcript.
 * @details Friend function that has controlled access to transcript's private round tracking state.
 *
 * @tparam TranscriptType The type of transcript (NativeTranscript or StdlibTranscript)
 * @param transcript The transcript to extract tag context from
 * @return OriginTag with (transcript_index, round_index, is_submitted=true)
 */
template <typename TranscriptType> inline OriginTag extract_transcript_tag(const TranscriptType& transcript)
{
    return OriginTag(transcript.transcript_index, transcript.round_index, /*is_submitted=*/true);
}

} // namespace bb
template <typename T>
concept usesTag = requires(T x, const bb::OriginTag& tag) { x.set_origin_tag(tag); };
