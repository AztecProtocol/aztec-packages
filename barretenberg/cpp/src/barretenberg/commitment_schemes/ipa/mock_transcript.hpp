#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <vector>
class MockTranscript {
  public:
    std::vector<uint256_t> challenges;
    std::vector<bb::curve::Grumpkin::AffineElement> group_elements;
    std::vector<uint256_t> field_elements;
    size_t current_challenge_index = 0;
    size_t current_field_index = 0;
    size_t current_group_index = 0;
    void reset(std::vector<uint256_t> challenges_,
               std::vector<bb::curve::Grumpkin::AffineElement> group_elements_ = {},
               std::vector<uint256_t> field_elements_ = {})
    {
        challenges = std::move(challenges_);
        current_challenge_index = 0;
        current_field_index = 0;
        current_group_index = 0;
        group_elements = std::move(group_elements_);
        field_elements = std::move(field_elements_);
    }
    void reset_for_verifier()
    {
        current_challenge_index = 0;
        current_field_index = 0;
        current_challenge_index = 0;
    }
    template <typename T> void send_to_verifier(const std::string&, const T& field_element)
    {
        field_elements.push_back(static_cast<uint256_t>(field_element));
    }
    template <> void send_to_verifier(const std::string&, const bb::curve::Grumpkin::AffineElement& group_element)
    {
        group_elements.push_back(group_element);
    }
    template <typename T> T get_challenge(const std::string&)
    {
        ASSERT(challenges.size() > current_challenge_index);
        if (current_challenge_index >= challenges.size()) {
            abort();
        }
        T result = challenges[current_challenge_index];
        current_challenge_index++;
        return result;
    }
    template <typename T> T receive_from_prover(const std::string&) { abort(); }
    template <> bb::curve::Grumpkin::ScalarField receive_from_prover(const std::string&)
    {
        ASSERT(field_elements.size() > current_field_index);
        return field_elements[current_field_index++];
    }
    template <> bb::curve::Grumpkin::BaseField receive_from_prover(const std::string&)
    {
        ASSERT(field_elements.size() > current_field_index);
        return field_elements[current_field_index++];
    }
    template <> bb::curve::Grumpkin::AffineElement receive_from_prover(const std::string&)
    {
        ASSERT(group_elements.size() > current_group_index);
        return group_elements[current_group_index++];
    }
};