// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <cstdint>

namespace bb::stdlib {

/**
 * @brief A simple wrapper around a vector of stdlib field elements representing a proof
 *
 * @tparam Builder
 */
template <typename Builder> class Proof : public std::vector<bb::stdlib::field_t<Builder>> {
  public:
    using Base = std::vector<bb::stdlib::field_t<Builder>>;
    using Base::Base; // Inherit all constructors from std::vector

    // Explicitly define vector copy constructor (not inherited by default)
    Proof(const std::vector<bb::stdlib::field_t<Builder>>& fields)
        : Base(fields)
    {}

    // Constructor from a native Proof
    Proof(Builder& builder, const HonkProof& native_proof)
    {
        for (const auto& element : native_proof) {
            this->push_back(bb::stdlib::witness_t<Builder>(&builder, element));
        }
    };

    // Extract the circuit builder context shared by the proof's witnesses.
    // Recursive verifiers recover their builder from the proof elements; validate_context checks that every
    // element belongs to the same builder and returns it (nullptr if the proof is empty or all-constant), so
    // we reject that case rather than dereferencing past the end of an empty proof.
    Builder* get_context() const
    {
        Builder* context = validate_context<Builder>(*this);
        if (context == nullptr) {
            throw_or_abort("stdlib::Proof::get_context: cannot extract builder from an empty or constant proof");
        }
        return context;
    }

    // Extract the native HonkProof
    HonkProof get_value() const
    {
        HonkProof result;
        result.reserve(this->size());
        for (const auto& element : *this) {
            result.push_back(element.get_value());
        }
        return result;
    };
};

} // namespace bb::stdlib
