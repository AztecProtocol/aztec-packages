#pragma once

namespace bb::plonk {

/**
 * @brief Compute the public inputs copy cycle discrepancy term \f$\Delta_\PI\f$
 * @details This is a linear-time method of evaluating public inputs, that doesn't require modifications to any
 * pre-processed selector polynomials. Following \cite PlonKVIP, we include public inputs into our protocol by modifying
 * the grand product argument of \cite PlonK. This has the advantage of allowing all selector polynomials to be
 * preprocessed, as opposed to the original handling of public inputs in \cite PlonK, which required altering the
 * selector \f$q_c\f$. A summary of our approach is as follows. We will reserve the first \f$\numpub\f$-many rows of the
 * execution trace for special gates to store these public inputs. To use the public inputs elsewhere in the circuit,
 *one uses copy constraints with these first \f$\numpub\f$-gates. This construction is not sufficient for a secure
 *protocol, as the verifier needs to verify that that the correct public information was used, but the verifier has only
 *the commitments to their blindings. To solve this, we modify the grand product argument to involve a term
 * \f$\Delta_{\PI}\f$ which is supplied by both the prover and the verifier. We now describe our protocol in more
 *detail. Let \f$ \pub_1,\ldots, \pub_\numpub \in \bF\f$ be the public inputs to the circuit. For each public input, we
 *lay down a gate having that public value as a witness on the first and second wire, setting all selectors zero so that
 *there is no constraint imposed (plonk::ComposerBase::compute_proving_key_base,
 *plonk::ComposerBase::compute_witness_base). The top of our execution trace looks like this:
 * @todo Update documentation? Really we have some dummy gate(s) first.
 * | \f$w_1\f$            | \f$w_2\f$            | \f$w_{*>2}\f$ | \f$q_*\f$    |
 * |----------------------|----------------------|---------------|--------------|
 * | \f$\pub_{1}\f$       | \f$\pub_{1}\f$       | \f$0\f$       | \f$0\f$      |
 * | \f$\pub_{2}\f$       | \f$\pub_{2}\f$       | \f$0\f$       | \f$0\f$      |
 * | \f$\vdots\f$         | \f$\vdots\f$         | \f$0\f$       | \f$0\f$      |
 * | \f$\pub_{\numpub}\f$ | \f$\pub_{\numpub}\f$ | \f$0\f$       | \f$0\f$      |
 * | \f$\vdots\f$         | \f$\vdots\f$         | \f$\vdots\f$  | \f$\vdots\f$ |
 *
 * Using the original PlonK permutation argument, we *could* impose a copy constraint linking the values of \f$w_1\f$
 *and \f$w_2\f$ in a given row by setting \f$S_{\sigma,1}(\omega^k) := k_0\omega^{k}\f$ for \f$k=0,\ldots, \numpub-1\f$
 * (indeed, we do this temporarily  in plonk::ComposerBase::compute_wire_copy_cycles). In that case, the permutation
 * argument would show that \f[ \frac
 * {\prod_{k=0}^{\numgates-1}\prod_{j=1}^{\numwires} (w_j(\omega^k) + \beta         \ID_j(\omega^k) + \gamma)}
 * {\prod_{k=0}^{\numgates-1}\prod_{j=1}^{\numwires} (w_j(\omega^k) + \beta S_{\sigma, j}(\omega^k) + \gamma)}
 * = 1.
 * \f]
 *
 * Instead, we choose an "external coset generator", an element \f$k_\ext\in \bF\f$ such that \f$k_\ext H\f$ is disjoint
 * from \f$H\f$ and every other \f$k_j H\f$, and we define \f$S_{\sigma', 1}\f$ by \f{align}{
 * S_{\sigma', 1}(\omega^k) &= k_\ext \omega^k \qquad k=0,\ldots,\numpub-1 \\
 * S_{\sigma', 1}(\omega^k) &= S_{\sigma, 1}(\omega^k) \qquad k=\numpub,\ldots,\numgates-1.
 * \f}
 * If we factor the above grand product expression as
 * \f{align}{
 * \frac
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma', 1}(\omega^k) + \gamma}
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma , 1}(\omega^k) + \gamma}
 * \cdot
 * \frac
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta          \ID_1(\omega^k) + \gamma}
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma', 1}(\omega^k) + \gamma}
 * \cdot
 * \frac
 * {\prod_{k=\numpub}^{\numgates-1} w_1(\omega^k) + \beta         \ID_1(\omega^k) + \gamma}
 * {\prod_{k=\numpub}^{\numgates-1} w_1(\omega^k) + \beta S_{\sigma, 1}(\omega^k) + \gamma}
 * \cdot
 * \frac
 * {\prod_{k=0}^{\numgates-1}\prod_{j=2}^{\numwires} w_j(\omega^k) + \beta         \ID_j(\omega^k) + \gamma}
 * {\prod_{k=0}^{\numgates-1}\prod_{j=2}^{\numwires} w_j(\omega^k) + \beta S_{\sigma, j}(\omega^k) + \gamma}
 * .
 * \f}
 * then we see our strategy. Defining
 * \f[
 * \Delta_\PI =
 * \frac
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma , 1}(\omega^k) + \gamma}
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma', 1}(\omega^k) + \gamma},
 * \f]
 * we have a quantitity that is efficiently computable by both the prover and the verifier that can be used to
 *"complete" the permutation argument. Define a modified grand product polynomial by Lagrange interpolation from
 *\f{align}{ Z(\omega^i) := \frac
 * {\prod_{k=0}^{k} w_1(\omega^i) + \beta         \ID_1(\omega^i) + \gamma}
 * {\prod_{k=0}^{k} w_1(\omega^i) + \beta S_{\sigma, 1}(\omega^i) + \gamma}
 * \cdot
 * \frac
 * {\prod_{k=0}^{k}\prod_{j=2}^{\numwires} w_j(\omega^i) + \beta        \ID_j(\omega^i) + \gamma}
 * {\prod_{k=0}^{k}\prod_{j=2}^{\numwires} w_j(\omega^i) + \beta S_{\sigma, j}(\omega^i) + \gamma}
 * .
 * \f}
 * <!-- We speak of modifying
 * \f[\frac
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta \ID_1(\omega^k) + \gamma}
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta   S_{\sigma, 1}(\omega^k) + \gamma}
 * \quad
 * \text{to}
 * \quad
 * \frac
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta \ID_1(\omega^k) + \gamma}
 * {\prod_{k=0}^{\numpub-1}\pub_k + \beta   S_{\sigma', 1}(\omega^k) + \gamma}
 * \f]
 * as "breaking" the valid copy cycle.  This is something we explicitly do in
 * plonk::ComposerBase::compute_sigma_permutations. --> The modified protocol assumes this modified grand product, and
 * adds a relation to enforce that \f$Z(\omega^\numgates) =  \Delta_\PI.\f$
 **/
template <typename Field>
Field compute_public_input_delta(const std::vector<Field>& public_inputs,
                                 const Field& beta,
                                 const Field& gamma,
                                 const Field& subgroup_generator)
{
    Field numerator = Field(1);
    Field denominator = Field(1);

    Field work_root = Field(1);
    Field T0;
    Field T1;
    Field T2;
    Field T3;
    for (const auto& witness : public_inputs) {
        T0 = witness + gamma;
        T1 = work_root * beta;
        T2 = T1 * Field::coset_generator(0);
        T3 = T1 * Field::external_coset_generator();
        T2 += T0;
        T3 += T0;
        numerator *= T2;
        denominator *= T3;
        work_root *= subgroup_generator;
    }
    T0 = numerator / denominator;
    return T0;
}
} // namespace bb::plonk