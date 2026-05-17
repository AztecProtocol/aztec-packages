// Derived parameters for the K=4 "quad" compressed Poseidon2 internal-round encoding on BN254.
// Treated like the base Poseidon2 constants: fixed, derivable from the sponge spec, pre-computed.
//
// See `barretenberg/cpp/src/barretenberg/stdlib/hash/poseidon2/README.md` for the algebraic
// derivation. The short version:
//
//   The compressed K=4 row stores state[0] at 4 consecutive internal rounds. Solving for the
//   non-S-boxed elements (s_1, s_2, s_3) at row-start reduces (via row-reduction) to a 3x3
//   Vandermonde system with nodes (D_2, D_3, D_4). Its Lagrange-basis inverse has 9 fixed
//   coefficients α_j^(k) that let us write s_j = Σ_k α_j^(k) b_k where b_k are linear in wires.
//
// This file exposes those 9 coefficients, the derived diagonal constants used by the entry
// relation, and the closed-form propagation tables consumed by the quad relations.
//
// Static assertions guard invertibility: the three Vandermonde differences (D_3 - D_2),
// (D_4 - D_2), (D_4 - D_3) must all be nonzero.

#pragma once

#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <array>
#include <cstddef>

namespace bb::crypto {

struct Poseidon2QuadBn254Params {
    using FF = Poseidon2Bn254ScalarFieldParams::FF;
    static constexpr size_t VANDERMONDE_SIZE = Poseidon2Bn254ScalarFieldParams::t - 1;

    // Internal matrix diagonal D_i (computed from the stored `D_i - 1` values).
    static constexpr FF D1 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[0];
    static constexpr FF D2 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[1];
    static constexpr FF D3 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[2];
    static constexpr FF D4 = FF(1) + Poseidon2Bn254ScalarFieldParams::internal_matrix_diagonal_minus_one[3];

    static constexpr FF SIGMA = D2 + D3 + D4; // Σ = D_2 + D_3 + D_4, recurs in the relation algebra

  private:
    // Vandermonde differences (used below and also asserted non-zero).
    static constexpr FF D2_minus_D3 = D2 - D3;
    static constexpr FF D2_minus_D4 = D2 - D4;
    static constexpr FF D3_minus_D4 = D3 - D4;

    // 1 / ((D_2 - D_3)(D_2 - D_4)) — denominator for α_1^(·)
    static constexpr FF inv_denom_1 = poseidon2_fr_from_limbs(
        { 0x0ee78acd18e97d90ULL, 0xd79d5c22106a623eULL, 0x3ed90deedcd2d295ULL, 0x214eac3d0d1d03e8ULL },
        { 0xd4588e2f9d4d222dULL, 0xbdbbb5da34f7e705ULL, 0x9fd019e56dfd7d63ULL, 0x17d22f831d46746dULL });
    // 1 / ((D_3 - D_2)(D_3 - D_4)) — denominator for α_2^(·)
    static constexpr FF inv_denom_2 = poseidon2_fr_from_limbs(
        { 0x76fedb4a57988dd6ULL, 0x6647e4561df5e662ULL, 0x646c5c3a2ce7ceadULL, 0x1124bda311ecbe27ULL },
        { 0x6a80653ee8ab1e5bULL, 0x4f614efc12b63898ULL, 0x21b47dc1e9195f9fULL, 0x0d1d6e3b5de15a9bULL });
    // 1 / ((D_4 - D_2)(D_4 - D_3)) — denominator for α_3^(·)
    static constexpr FF inv_denom_3 = poseidon2_fr_from_limbs(
        { 0x01dd85106f7df49cULL, 0x12829018c5129882ULL, 0xcd5b2143f9480f77ULL, 0x2e553305a3597e43ULL },
        { 0x050902256a07bf79ULL, 0x1b16e372320b50f3ULL, 0xf6cbae0f2a6a7b5aULL, 0x0b74b0b46609d120ULL });

    // Invertibility guard. det(V) = (D_3 - D_2)(D_4 - D_2)(D_4 - D_3).
    static_assert(!D2_minus_D3.is_zero(), "Poseidon2 quad: D_2 == D_3, Vandermonde singular");
    static_assert(!D2_minus_D4.is_zero(), "Poseidon2 quad: D_2 == D_4, Vandermonde singular");
    static_assert(!D3_minus_D4.is_zero(), "Poseidon2 quad: D_3 == D_4, Vandermonde singular");
    static_assert(inv_denom_1 * D2_minus_D3 * D2_minus_D4 == FF(1));
    static_assert(inv_denom_2 * (-D2_minus_D3) * D3_minus_D4 == FF(1));
    static_assert(inv_denom_3 * (-D2_minus_D4) * (-D3_minus_D4) == FF(1));

  public:
    // Lagrange basis coefficients α_j^(k).
    //
    //   s_j = α_j^(1) * b_1 + α_j^(2) * b_2 + α_j^(3) * b_3
    //
    // where b_k is the k-th right-hand side of the row-reduced Vandermonde system. These are
    // the coefficients of the Lagrange polynomial at node D_{j+1} (taking nodes (D_2, D_3, D_4)):
    //
    //   L_j(x) = α_j^(1) + α_j^(2) * x + α_j^(3) * x^2
    //          = Π_{k ≠ j} (x - D_{k+1}) / (D_{j+1} - D_{k+1})
    //
    // Concretely:
    //   α_1^(1) =  D_3 * D_4     / ((D_2 - D_3)(D_2 - D_4))
    //   α_1^(2) = -(D_3 + D_4)   / ((D_2 - D_3)(D_2 - D_4))
    //   α_1^(3) =  1             / ((D_2 - D_3)(D_2 - D_4))
    //   (and analogously for α_2^(k), α_3^(k))
    // α_j^(1): constant term of L_j.
    static constexpr FF alpha_1_1 = D3 * D4 * inv_denom_1;
    static constexpr FF alpha_2_1 = D2 * D4 * inv_denom_2;
    static constexpr FF alpha_3_1 = D2 * D3 * inv_denom_3;

    // α_j^(2): linear term (negated sum of other nodes, divided by the denominator)
    static constexpr FF alpha_1_2 = -(D3 + D4) * inv_denom_1;
    static constexpr FF alpha_2_2 = -(D2 + D4) * inv_denom_2;
    static constexpr FF alpha_3_2 = -(D2 + D3) * inv_denom_3;

    // α_j^(3): quadratic term (pure reciprocal of the denominator)
    static constexpr FF alpha_1_3 = inv_denom_1;
    static constexpr FF alpha_2_3 = inv_denom_2;
    static constexpr FF alpha_3_3 = inv_denom_3;

    // Closed-form 4-round propagation coefficients.
    //
    // The four-round internal-block update on the non-S-boxed lanes (s_1, s_2, s_3) is linear
    // once the four S-boxed scalars u_k = (w_k + c_k)^5 are taken as opaque inputs:
    //
    //   step(v, u) = A v + u · 1,    A = [[D_2,1,1],[1,D_3,1],[1,1,D_4]]
    //
    // After 4 rounds with inputs u_0..u_3, the state-at-round-4 components (out_1, out_2, out_3)
    // and the state-at-round-3 row-sum T_3 (used by out_0 = D_1 u_3 + T_3) are all fixed linear
    // combinations of (w_r, w_o, w_4, u_0, u_1, u_2, u_3), where the (w_r, w_o, w_4)-dependence
    // enters through  s^{(0)} = V^{-1} b  and  b_k = linear(w_*, u_0..u_2). Composing  A^4 V^{-1}
    // with the b_k formulas gives the 28 constants below, one per (output, input) cell.
    //
    // Equivalence to the step iteration is verified in a unit test (see `poseidon2_quad_closed_form.test.cpp`).
    //
    // Linear round-propagation vectors  (A^k · 1)_j  for k = 1, 2.
    //
    // Used by both the entry relation (which checks state[0] at rounds 1, 2 from a standard
    // encoded predecessor) and the closed-form coefficient tables below.
    //
    //   A_one[j]  = (A · 1)_j   = D_{j+1} + 2
    //   A2_one[j] = (A^2 · 1)_j = D_{j+1}^2 + D_{j+1} + Σ + 4
    //   sum_A_one = 1^T A · 1   = Σ + 6  (also = (A · 1) summed over rows)
    static constexpr std::array<FF, VANDERMONDE_SIZE> A_one = { D2 + FF(2), D3 + FF(2), D4 + FF(2) };
    static constexpr std::array<FF, VANDERMONDE_SIZE> A2_one = {
        D2 * D2 + D2 + SIGMA + FF(4),
        D3* D3 + D3 + SIGMA + FF(4),
        D4* D4 + D4 + SIGMA + FF(4),
    };
    static constexpr FF sum_A_one = SIGMA + FF(6);

    // Closed-form coefficient table layout. Each row gives coefficients for the inputs
    //   (w_r, w_o, w_4, u_0, u_1, u_2, u_3),
    // where u_k = (s_0^{(k)} + c_k)^5.
    //
    //   closed_form[j] for j in {0,1,2,3}: coefficients of out_j, i.e. state[j] after four
    //                                      internal rounds. The terminal relation consumes all
    //                                      four rows; the interior relation consumes row 0.
    //
    //   forward_vandermonde_lhs[k] for k in {0,1,2}: coefficients of the forward-Vandermonde
    //                                                combinations used by the interior relation:
    //                                                row 0 = out_1 + out_2 + out_3
    //                                                row 1 = D_2 out_1 + D_3 out_2 + D_4 out_3
    //                                                row 2 = D_2^2 out_1 + D_3^2 out_2 + D_4^2 out_3
    enum ClosedFormColumn : size_t {
        W_R,
        W_O,
        W_4,
        U_0,
        U_1,
        U_2,
        U_3,
    };
    enum ClosedFormOutput : size_t {
        OUT_0,
        OUT_1,
        OUT_2,
        OUT_3,
    };
    static constexpr size_t CLOSED_FORM_INPUT_COUNT = VANDERMONDE_SIZE + Poseidon2Bn254ScalarFieldParams::t;
    static_assert(CLOSED_FORM_INPUT_COUNT == U_3 + 1);
    using ClosedFormRow = std::array<FF, CLOSED_FORM_INPUT_COUNT>;
    using ClosedFormTable = std::array<ClosedFormRow, 4>;
    using ForwardVandermondeTable = std::array<ClosedFormRow, VANDERMONDE_SIZE>;

  private:
    struct Tables {
        ClosedFormTable closed_form;
        ForwardVandermondeTable forward_vandermonde_lhs;
    };

  public:
    // Public coefficient tables consumed by the relations.
    // TODO(AI): Test these literals against the previous table initializer.
    static inline constexpr Tables tables{
        ClosedFormTable{
            ClosedFormRow{
                poseidon2_fr_from_limbs(
                    { 0x64e33a1221a2ad98ULL, 0xaed32780800133fdULL, 0x81ac966f8d331c70ULL, 0x0cf863bc4f12c74aULL },
                    { 0xb2317241882c14cbULL, 0x75b98a3cdb00923dULL, 0xec49f71a1f00c19bULL, 0x35724901ff687746ULL }),
                poseidon2_fr_from_limbs(
                    { 0x3bc7da244d1b5f82ULL, 0x35f5e7e8c6ad422eULL, 0xaa1244db683475c7ULL, 0x222fc2380b603ecdULL },
                    { 0xef6c8d93072b6463ULL, 0xc0a12dd619f04e24ULL, 0xa56cac2c7eb45beaULL, 0x3284de079ed29f51ULL }),
                poseidon2_fr_from_limbs(
                    { 0x2c2e0913fc6562aeULL, 0x9ee012b5eebb7a0cULL, 0xe23f9b16056bed31ULL, 0x2ea860f5f9d62cc5ULL },
                    { 0xc72a50123bd88eaaULL, 0x47a81458a535103bULL, 0x6e35b27f6532fbeeULL, 0x047ad97d6290773dULL }),
                poseidon2_fr_from_limbs(
                    { 0xc0aee586874346efULL, 0x15d63a5190641df5ULL, 0x22065601255af0a4ULL, 0x03b29be0455b7a7dULL },
                    { 0x5e64d71ff23ea5acULL, 0xcccf9841da0ce6c5ULL, 0xa3581da3cfa5b32eULL, 0x097cbce742906f0aULL }),
                poseidon2_fr_from_limbs(
                    { 0x5b6fb000e42fe7caULL, 0xa780856ca23731c3ULL, 0x90ff206a93a84a8cULL, 0x1fe98fa1b77f7c35ULL },
                    { 0x2cbf4dcb8cb56cd3ULL, 0x994f5a42ccf51bceULL, 0x82b4542f95b2db8cULL, 0x5b67913fba8d343bULL }),
                poseidon2_fr_from_limbs(
                    { 0xc8680119c5f048b0ULL, 0xed4b4810b4a95d82ULL, 0x8ab5e41cf53e0480ULL, 0x05b4f1252edcd066ULL },
                    { 0x8c9d2ce14d80cb8fULL, 0x7590785fc8c1c9edULL, 0x86707c33ffdd8bc2ULL, 0x3fcc6f8f92b65f30ULL }),
                poseidon2_fr_from_limbs(
                    { 0xb56821fd19d3b6e8ULL, 0x0d03f98929ca1d7fULL, 0x04b1e03b4bd9490cULL, 0x10dc6e9c006ea38bULL },
                    { 0x2549f8fbcb603c70ULL, 0x1450cbc4e9f8870dULL, 0x303d5cb06f7ccf18ULL, 0x3e1570aa09190aaeULL }) },
            ClosedFormRow{
                poseidon2_fr_from_limbs(
                    { 0x44dec7e436a21b38ULL, 0x87942fc84b800b37ULL, 0x5cdfb66e93c9e2aeULL, 0x224a28d6b1569838ULL },
                    { 0xf46bb7ffa3036ba9ULL, 0x702976ec2d8f360eULL, 0xae153121e0bf938eULL, 0x4b5b8b1c490c943eULL }),
                poseidon2_fr_from_limbs(
                    { 0x07aa42b194c12d43ULL, 0xb843f7926b0da832ULL, 0xcc36cbdc6561c029ULL, 0x28f09700bac81319ULL },
                    { 0x4fc86c75943085f9ULL, 0x2110efb52dda0c7aULL, 0x17f3e554a5b9c394ULL, 0x16ccba82a5c1a645ULL }),
                poseidon2_fr_from_limbs(
                    { 0x42fa2b7a8a553debULL, 0xc8d6eca9b00576e8ULL, 0x2ad537feb4a5ce06ULL, 0x0d12d1d097d68466ULL },
                    { 0x0a399c46aa5e9864ULL, 0x809ca5a23c538ecbULL, 0x92466e77a6630f16ULL, 0x2160db9bde59524cULL }),
                poseidon2_fr_from_limbs(
                    { 0x0877dc46ff7f79e5ULL, 0x57ba6264d81d8aeaULL, 0xdb03757b63e33d3fULL, 0x0a70c78e61573e99ULL },
                    { 0xa4bc3965698c3a2fULL, 0xe8eb1a3c576095caULL, 0x04d620af1456e24cULL, 0x08eb25f9fae9ee54ULL }),
                poseidon2_fr_from_limbs(
                    { 0x3dadb3ab701f334cULL, 0xae75c4dec5895afcULL, 0x89d7a194f1c2e83dULL, 0x01ea2ebadd9d4111ULL },
                    { 0x6d2a104ecd20ec9cULL, 0xd6566cad40d234f7ULL, 0x5d456692b39c3b28ULL, 0x460b0b98da73cb21ULL }),
                poseidon2_fr_from_limbs(
                    { 0xfdb65336c6abc8e1ULL, 0x25744a6981b9c621ULL, 0x158f123b69970d33ULL, 0x054394503ca1721cULL },
                    { 0xab7fff12994a35c2ULL, 0xce434b7d43347e22ULL, 0xd75f67999f684b10ULL, 0x136ca3456621e4d4ULL }),
                poseidon2_fr_from_limbs(
                    { 0x0000000000000001ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL },
                    { 0xac96341c4ffffffbULL, 0x36fc76959f60cd29ULL, 0x666ea36f7879462eULL, 0x0e0a77c19a07df2fULL }) },
            ClosedFormRow{
                poseidon2_fr_from_limbs(
                    { 0xc97696b61662ff58ULL, 0x16d194cc693dbc10ULL, 0x5a240ec153383932ULL, 0x1adfdc4b624947c0ULL },
                    { 0x51ff86f5eaa247d6ULL, 0xc8f8f05e997ce19fULL, 0x362ff26935a7f95aULL, 0x5954d41c642f9b91ULL }),
                poseidon2_fr_from_limbs(
                    { 0xf6c8d31b8dd2f4daULL, 0x9dca16656f1ed9c7ULL, 0x29f022418864b987ULL, 0x049316cb3affc3b0ULL },
                    { 0x31f47e1c925b29f3ULL, 0x7058d8403540451dULL, 0xf78f52df4853565bULL, 0x4440cb684b2944a6ULL }),
                poseidon2_fr_from_limbs(
                    { 0x9160735682684ce2ULL, 0x9fbf542bb11e46edULL, 0x7fd8f5ae4fa09e5aULL, 0x2096501be4ffb0dfULL },
                    { 0xb58ba7b4c8a642b5ULL, 0x86a5489db07d309fULL, 0x31043284a5658844ULL, 0x1910b33031b6ac76ULL }),
                poseidon2_fr_from_limbs(
                    { 0x9d933bb1f906a073ULL, 0x7ef456d756bb32aaULL, 0xad107846478ef817ULL, 0x20b4b7dde9fb5e4aULL },
                    { 0x7c568261555134a1ULL, 0x99b6da3ad0fd987aULL, 0x98f5a387022bc963ULL, 0x020d3ba4d10a8cdeULL }),
                poseidon2_fr_from_limbs(
                    { 0xc7450be47c1d9467ULL, 0x68b88a7d04b7d081ULL, 0xe4a2b0afabd991f4ULL, 0x03f1e1d24386c01aULL },
                    { 0x2bfa4d49de112581ULL, 0x73f8d16f2830b36fULL, 0x769d8ee812f9b6faULL, 0x38c6f4c06a679ddfULL }),
                poseidon2_fr_from_limbs(
                    { 0xa649afa724a49c3fULL, 0x66b0cb3bea1968b2ULL, 0xa5f98dd1dfdafe11ULL, 0x2d46ff2a2d0b4fa8ULL },
                    { 0x4215d50209d38c24ULL, 0x5c27199169e0352bULL, 0xf4991a02fbba59d5ULL, 0x42f32824c48111c1ULL }),
                poseidon2_fr_from_limbs(
                    { 0x0000000000000001ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL },
                    { 0xac96341c4ffffffbULL, 0x36fc76959f60cd29ULL, 0x666ea36f7879462eULL, 0x0e0a77c19a07df2fULL }) },
            ClosedFormRow{
                poseidon2_fr_from_limbs(
                    { 0xb2485bf0c0108017ULL, 0x2c05b27cd59de00dULL, 0x7aac3d8d4b924412ULL, 0x064afb0901833958ULL },
                    { 0x81675f87b80156d9ULL, 0xdbc4b3b47c33e862ULL, 0x87a3053f481c7626ULL, 0x3682a8824c87160dULL }),
                poseidon2_fr_from_limbs(
                    { 0x2f4d03e3aaea76a7ULL, 0x1c249483372ae369ULL, 0x989e9915e6de6b0bULL, 0x26856399bcbb4617ULL },
                    { 0xc4e19721a576fed0ULL, 0x3cb21c522303447eULL, 0x581412962c0c6e7eULL, 0x45cf5a384551d710ULL }),
                poseidon2_fr_from_limbs(
                    { 0x0e970d9fec1123f0ULL, 0x91f3485a723079b0ULL, 0xb3b579d0806d792dULL, 0x01a4b4ae859d2d34ULL },
                    { 0xb41ea6bf860147b2ULL, 0x772ba72e370871b6ULL, 0x0c4a64f7f3ced9c1ULL, 0x169e5ac2c9ae5761ULL }),
                poseidon2_fr_from_limbs(
                    { 0x1b09ba9291722309ULL, 0x5e9d3be76a392b9eULL, 0xc820dbdf47b45d5aULL, 0x017cf284f46f1673ULL },
                    { 0xfff7cfd7ba6bb090ULL, 0xc060de55429cee72ULL, 0x336db0e3362fda71ULL, 0x3a3ca35b57a4f414ULL }),
                poseidon2_fr_from_limbs(
                    { 0x4f5c8e9d805ec986ULL, 0x67562acc9937222fULL, 0x4d928c483bd67a81ULL, 0x14ec716fb2a8f448ULL },
                    { 0x9a1d2d8937d154ffULL, 0x03f607c082595988ULL, 0x911b7a1b289ba4d0ULL, 0x15088d951d61d81aULL }),
                poseidon2_fr_from_limbs(
                    { 0x6bce0b3164a96f8bULL, 0xaa2e3f77966ee4a6ULL, 0x6668ae77f13be7d2ULL, 0x0fcc87a502d35bdcULL },
                    { 0x373bb50e3ea4691aULL, 0xd3c70cd2f8e96ae5ULL, 0xd6416fcfe1da909cULL, 0x3ccaa01b42b2aa84ULL }),
                poseidon2_fr_from_limbs(
                    { 0x0000000000000001ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL },
                    { 0xac96341c4ffffffbULL, 0x36fc76959f60cd29ULL, 0x666ea36f7879462eULL, 0x0e0a77c19a07df2fULL }) },
        },
        ForwardVandermondeTable{
            ClosedFormRow{
                poseidon2_fr_from_limbs(
                    { 0x7cbbc4f71d159aa6ULL, 0xa2378ec910a236c4ULL, 0x795fbd06b1130795ULL, 0x1310b1b833f17927ULL },
                    { 0xfc2cbdc175a70a55ULL, 0x9c4b6225d613ae5cULL, 0x42f757a6d9fff9f8ULL, 0x4a061c62562e6560ULL }),
                poseidon2_fr_from_limbs(
                    { 0xe9de241cdd7e98c3ULL, 0x49feba32979df4d1ULL, 0xd675417d53238c5fULL, 0x23a4c2f2d1517cb7ULL },
                    { 0xbeda968bec02aebaULL, 0x7db413b692aab4f3ULL, 0xf6f6bf5d1716d7b3ULL, 0x4014433d73d981a8ULL }),
                poseidon2_fr_from_limbs(
                    { 0xe2f1ac70f8ceaebdULL, 0xfa89892fd3543785ULL, 0x5e63a77d84b3e58eULL, 0x2f4dd69b0273627aULL },
                    { 0x73e3eabaf90622cbULL, 0x7e6d956e23d93121ULL, 0xcf9505f43f97711cULL, 0x510fe98ed9be5623ULL }),
                poseidon2_fr_from_limbs(
                    { 0xc114d28b89f83d61ULL, 0x354bf5239911e932ULL, 0x5034c9a0f32692b1ULL, 0x2ca271f13fc1b358ULL },
                    { 0xdd28960a89491f5fULL, 0x1aceea83f141ac26ULL, 0x18e92f62cb312dc5ULL, 0x14d0b6874267cf1dULL }),
                poseidon2_fr_from_limbs(
                    { 0x544f4e2d6c9b9139ULL, 0x7e847a2863784dadULL, 0xbc0cde8cd972f4b3ULL, 0x1ac881fcd3ccf574ULL },
                    { 0xab7d9ffa0303671aULL, 0xfddd754bf7e960ccULL, 0xf45de428ec2ee638ULL, 0x3311f1089fda00c7ULL }),
                poseidon2_fr_from_limbs(
                    { 0xcbec187b5ff9d4aaULL, 0x0e1f6cd48888a2e9ULL, 0x69a108ceb92c9abaULL, 0x11f2ccac8b4e7d77ULL },
                    { 0x9d0d9dfb01c22afeULL, 0xadc9a150b28b3d10ULL, 0x319965ff79fa84c8ULL, 0x3261ce9faaf260c8ULL }),
                poseidon2_fr_from_limbs(
                    { 0x0000000000000003ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL },
                    { 0x05c29c54effffff1ULL, 0xa4f563c0de22677dULL, 0x334bea4e696bd28aULL, 0x2a1f6744ce179d8eULL }) },
            ClosedFormRow{
                poseidon2_fr_from_limbs(
                    { 0x88864d7303b4e878ULL, 0xa7b170c85f5a5d09ULL, 0x513681e21c2bac2aULL, 0x107ce54a3082546cULL },
                    { 0x1d90f0026e6a09a4ULL, 0x7df2ca7861232d5dULL, 0x9ca11e20f66057bfULL, 0x5666ce8ba15d494aULL }),
                poseidon2_fr_from_limbs(
                    { 0x99fa22a7dde160d2ULL, 0x18767ccd86c0f677ULL, 0x5697a665dcf83cb1ULL, 0x0e6b58df9c236f56ULL },
                    { 0xf49a2900e26909d4ULL, 0x0b33c17e22a475ddULL, 0x9222d1a121fb1749ULL, 0x1055e255cdd65633ULL }),
                poseidon2_fr_from_limbs(
                    { 0x67b3cc6f4a928f15ULL, 0x088bc85047f742b3ULL, 0xca397e58329bf764ULL, 0x2b0a0b54ecdbad09ULL },
                    { 0x58171d4cb146ab0fULL, 0x4c57fbbd338d5c2bULL, 0x4ab022066f0d74a7ULL, 0x4e984b7ad1eaa765ULL }),
                poseidon2_fr_from_limbs(
                    { 0x471a022fbeb0dc36ULL, 0x319b267725b591a2ULL, 0x438d69a76233c1f4ULL, 0x26bc04e43139ab06ULL },
                    { 0x6a3f2d928176cb43ULL, 0x5b9bb6da7beed585ULL, 0x7c94a8149d6f23ccULL, 0x264f3bbb174cfdacULL }),
                poseidon2_fr_from_limbs(
                    { 0x2fa725ccab03f66eULL, 0xb0ca32cc4c031d89ULL, 0x16667d46a099d388ULL, 0x173b15676253c629ULL },
                    { 0xa7ceb1d752d78317ULL, 0x5e5b282162efafd5ULL, 0xb424b146f48ea156ULL, 0x419f203f9fb26c9bULL }),
                poseidon2_fr_from_limbs(
                    { 0x7da26517154f953eULL, 0xdcb14c16ec28fbd4ULL, 0x5b20d27305922e7fULL, 0x182b7b1c524af8bfULL },
                    { 0xdba819f5b77cc911ULL, 0x14982f79c04af058ULL, 0x40a30019312c172cULL, 0x5fec7dc7a013c528ULL }),
                poseidon2_fr_from_limbs(
                    { 0x2c2e0913fc6562aeULL, 0x9ee012b5eebb7a0cULL, 0xe23f9b16056bed31ULL, 0x2ea860f5f9d62cc5ULL },
                    { 0x0b0c45a62bd88eabULL, 0x6fdbfca11eee80cdULL, 0x2685f835e6b4544bULL, 0x34df27f043c21767ULL }) },
            ClosedFormRow{
                poseidon2_fr_from_limbs(
                    { 0x681b66a25c340b93ULL, 0xe366efd3d3b4f939ULL, 0xd28edfbab02732b2ULL, 0x0dd168a1d302eef2ULL },
                    { 0x3399c060e532cd43ULL, 0x500884ea4dd45303ULL, 0x351fdfe101b130bdULL, 0x0245184aebd65791ULL }),
                poseidon2_fr_from_limbs(
                    { 0xbddb02dff7fc8141ULL, 0x9df22865d04162a5ULL, 0x4dd1b2776f68c13aULL, 0x22d8d49f94d59a96ULL },
                    { 0xd5fe4e605048926eULL, 0x6e477b075f0b6515ULL, 0x1af6682c3d254042ULL, 0x59c9c81d340f708bULL }),
                poseidon2_fr_from_limbs(
                    { 0x77c9db49bcaac5daULL, 0xa1d083e09824fd47ULL, 0x8c01be7059b311a3ULL, 0x20feb53e91cfe391ULL },
                    { 0xa0e83f6162f834e8ULL, 0xdb0f7339b2354e43ULL, 0x47c9de038a9266bbULL, 0x5e48eeac978e98dbULL }),
                poseidon2_fr_from_limbs(
                    { 0x9bc7639095a69d4fULL, 0x6e1c0388adfd82fdULL, 0x8624695de6b7a940ULL, 0x1ccfe6ba3ec4b704ULL },
                    { 0xa022d9bbefcfbcffULL, 0xbe11e79fec39e313ULL, 0x35e5b8658f9d8f94ULL, 0x0029e4892a494d64ULL }),
                poseidon2_fr_from_limbs(
                    { 0x05e69d5b0560d064ULL, 0x9b1fa632fd6f521aULL, 0x0b2904c1e367c0f2ULL, 0x1e14add03fd6652cULL },
                    { 0x1ba3d86b4bc3396cULL, 0x2e16c9a76adba1b4ULL, 0x2bfe1912c87ed167ULL, 0x41a3b638b9ad6d49ULL }),
                poseidon2_fr_from_limbs(
                    { 0xbe06bfaf6f613b3cULL, 0x835ebce91323f32fULL, 0x84b5fc31c3a8811cULL, 0x0154bb2e7f5939ccULL },
                    { 0x3243a083de6f1a2cULL, 0x71c960de74a0ed56ULL, 0x81a04a8a2a864f23ULL, 0x143c3e4b2e51b022ULL }),
                poseidon2_fr_from_limbs(
                    { 0xdad7910155ea0e38ULL, 0x084b88d020480922ULL, 0x5025a6a26b6702f9ULL, 0x21194a602ca2011eULL },
                    { 0x9bad35381031874dULL, 0x1d57e40afb3e20ddULL, 0xc6ba233a6cf5804fULL, 0x5fba477fbd935a82ULL }) },
        },
    };
};

} // namespace bb::crypto
