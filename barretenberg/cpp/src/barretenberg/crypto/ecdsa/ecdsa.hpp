// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "../hashers/hashers.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"

#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"

#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <string>

namespace bb::crypto {

static constexpr int ECDSA_RECOVERY_ID_OFFSET = 27;
static constexpr int ECDSA_R_FINITENESS_OFFSET = 2;

template <typename Fr, typename G1> struct ecdsa_key_pair {
    Fr private_key;
    G1::affine_element public_key;

    // For serialization, update with any new fields
    SERIALIZATION_FIELDS(private_key, public_key);
};

struct ecdsa_signature {
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;

    // For serialization, update with any new fields
    SERIALIZATION_FIELDS(r, s, v);
};

/**
 * @brief Generate the ECDSA for the message using the provided account key pair and hash function
 *
 */
template <typename Hash, typename Fq, typename Fr, typename G1>
ecdsa_signature ecdsa_construct_signature(const std::string& message, const ecdsa_key_pair<Fr, G1>& account);

/**
 * @brief Given a message and a valid signature with recovery_id, recover the public key whose private key was used to
 * sign the message
 *
 * @details Given \f$(m, (r, s))\f$ a valid signature for message m, we can recover up to four public keys for which
 * this is a valid signature: a public key P is valid if \f$H(m) \cdot s^{-1} G + r \cdot s^{-1} P = \pm R\f$, where R
 * is the point on the curve with x-coordinate equal to r. Given r, there can be two points R with that x-coordinate.
 * Solving the equation for \f$P\f$, gives \f$P = r^{-1} \cdot s \cdot (- H(m) \cdot s^{-1} G + \pm R)$, which means we
 * have up to four possibilities for \f$P\f$. We use a recovery_id \f$v\f$ to select which of the four public keys to
 * get. The mapping is: recovery_id = offset (=27) +
 *  y is even  &&  x < |Fr| --> 0
 *  y is odd   &&  x < |Fr| --> 1
 *  y is even  &&  |Fr| <= x < |Fq| --> 2
 *  y is odd   &&  |Fr| <= x < |Fq| --> 3
 *
 * @note We enforce the signature to have low-s: meaning s < (Fr::modulus + 1) / 2. This means that if s is flipped, the
 * effective nonce point R becomes -R, which has the opposite y-parity. We take this into account when generating the
 * recovery_id.
 */
template <typename Hash, typename Fq, typename Fr, typename G1>
typename G1::affine_element ecdsa_recover_public_key(const std::string& message, const ecdsa_signature& sig);

/**
 * @brief Verify the ECDSA signature for the message using the provided public key and hash function
 *
 */
template <typename Hash, typename Fq, typename Fr, typename G1>
bool ecdsa_verify_signature(const std::string& message,
                            const typename G1::affine_element& public_key,
                            const ecdsa_signature& signature);

/**
 * @brief Hash the message and trim the hash output if required
 *
 * @details Following https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-5.pdf, if the length of the hash output is
 * longer than the bit length of the modulus of the scalar field, we trim the hash output.
 *
 */
template <typename Hash, typename Fr> Fr ecdsa_hash_message(const std::string& message);

inline bool operator==(ecdsa_signature const& lhs, ecdsa_signature const& rhs)
{
    return lhs.r == rhs.r && lhs.s == rhs.s && lhs.v == rhs.v;
}

inline std::ostream& operator<<(std::ostream& os, ecdsa_signature const& sig)
{
    os << "{ " << sig.r << ", " << sig.s << ", " << static_cast<uint32_t>(sig.v) << " }";
    return os;
}

} // namespace bb::crypto

#include "ecdsa_impl.hpp"
