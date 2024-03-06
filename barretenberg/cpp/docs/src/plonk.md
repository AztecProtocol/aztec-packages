# Plonk
<!-- \tableofcontents -->

We describe the Plonk variants as implemented in Barretenberg. This differs from what is described in \cite Plonk in several respects. These include:
 - The presence of custom gates (see...); in particular
     - The use of Plookup.
     - Implementation of ROM and RAM (see...)
 - The use of generalized permutation argument range constraints in the Turbo and Ultra variants (see...)
 - The use of R
 - The handling of public inputs through a modification of the grand product argument (see...)
 - The absence of Maller's linerization optimization (see...)
 - The use of "short scalars" (see...)


# Preliminaries
## Widgets
A widget is a class that implements the arithmetic needed by the prover and verifier which is particular to a given relation imposed between the protocols data-carrying polynomials. A data-carrying polynomial is a witness polynomial, one of circuit-defining polynomials, or an auxiliary polynomial such as a Lagrange polynomial or a grand product polynomial. A relation is an expression (always a polynomial expression, but we try not to use the term "polynomial" here to reduce confusion) such as the arithmetic relation, which enables a simultaneous generalization of addition and multiplication gates. A complete list of relations is available here: [link to nowhere](...todo.)
# Flavors

# Prover's algorithm

# Verifier's algorithm?
The generic Plonk verifier is implemented in plonk::VerifierBase::verify_proof(). It is templated by an argument `program_settings`, the possible value of which are specified in cpp/src/aztec/plonk/proof_system/types/program_settings.hpp.


...


# Permutation argument

TODO: Some combo of: update comments in code; excerpt those comments here; move this up as an intro section and / or split some of the discussion into prover and verifier comments.

...
## Original argument
The original grand product argument of \cite Plonk allows us to prove that copy constraints hold between the wire polynomials \f$ w_1, \ldots, w_{n_{\text{wires}}}\f$ on \f$H\f$. The copy constraints are equivalent to a decomposition of the disjoint union \f$\bigsqcup^\numwires H\f$ into into disjoint subsets, which is equivalent to the cycle decomposition of a permutation on \f$\bigsqcup^\numwires H\f$. To implement this permutation, we choose \f$k_{-1}=1, k_0, \ldots, k_{\numwires-2}\in \bF\f$ such that \f$k_i H \cap k_j H = \emptyset\f$, and we use \f$\bigcup_{i=-1}^{\numwires-2}k_i H \subset \bF\f$ as the implementation of the disjoint union (we call the \f$k_i\f$'s "coset generators"; see, e.g., barretenberg::Bn254FrParams::coset_generators_0, which specifies a 64-bit limb of 8 coset generators). The functions plonk::ComposerBase::compute_wire_copy_cycles and plonk::ComposerBase::compute_sigma_permutations collect the permutation data from the circuit, while plonk::compute_permutation_lagrange_base_single realizes this permutation using polynomials \f$S_{\sigma,1},\ldots, S_{\sigma,\numwires}\f$. If the copy cycle permutation \f$\sigma\f$ maps \f$w_{j}(\omega^{i_1})\f$ to \f$w_{\ell}(\omega^{i_2})\f$, then we set
\f$S_{\sigma,j}(\omega^{i_1}) := k_{\ell-2} \omega^{i_2}\f$ 
Varying over all values of \f$i_1\f$, this defines \f$S_{\sigma,j}\f$ by Lagrange interpolation. We similary represent the identity permutation using polynomials \f$\ID_{1},\ldots, \ID_{\numwires}\f$ defined by
\f$\ID_{j}(\omega^i) = k_{j-2}\omega^i\f$ 
By an application of the Schwartz-Zippel lemma, the verifier is convinced that the copy constraints hold if the identity
\f[
\prod_{k=0}^{\numgates-1}\prod_{j=1}^{\numwires} (w_j(\omega^k) + \beta \ID_j(\omega^k) + \gamma) =
\prod_{k=0}^{\numgates-1}\prod_{j=1}^{\numwires} (w_j(\omega^k) + \beta   S_{\sigma, j}(\omega^k) + \gamma)
\f]
holds for \f$\beta,\gamma\in\bF\f$ that were generated in a uniformly random manner. This fact is argued by defining a grand product polynomial.

@copydetails honk::Prover::compute_grand_product_polynomial.


## Public Inputs
Following \cite PlonkVIP, we include public inputs into our protocol by modifying the grand product argument of \cite Plonk. This has the advantage of allowing all selector polynomials to be preprocessed, as opposed to the original handling of public inputs in \cite Plonk, which required altering the selector \f$q_c\f$. A summary of our approach is as follows. We will reserve the first \f$\numpub\f$-many rows of the execution trace for special gates to store these public inputs. To use the public inputs elsewhere in the circuit, one uses copy constraints with these first \f$\numpub\f$-gates. This construction is not sufficient for a secure protocol, as the verifier needs to verify that that the correct public information was used, but the verifier has only the commitments to their blindings. To solve this, we modify the grand product argument to involve a term \f$\Delta_{\PI}\f$ which is supplied by both the prover and the verifier. We now describe our protocol in more detail.

Let \f$ \pub_1,\ldots, \pub_\numpub \in \bF\f$ be the public inputs to the circuit. For each public input, we lay down a gate having that public value as a witness on the first and second wire, setting all selectors zero so that there is no constraint imposed (plonk::ComposerBase::compute_proving_key_base, plonk::ComposerBase::compute_witness_base). The top (\TODO: Really we have some dummy gate(s) first) of our execution trace looks like this:

| \f$w_1\f$            | \f$w_2\f$            | \f$w_{*>2}\f$ | \f$q_*\f$    |
|----------------------|----------------------|---------------|--------------|
| \f$\pub_{1}\f$       | \f$\pub_{1}\f$       | \f$0\f$       | \f$0\f$      |
| \f$\pub_{2}\f$       | \f$\pub_{2}\f$       | \f$0\f$       | \f$0\f$      |
| \f$\vdots\f$         | \f$\vdots\f$         | \f$0\f$       | \f$0\f$      |
| \f$\pub_{\numpub}\f$ | \f$\pub_{\numpub}\f$ | \f$0\f$       | \f$0\f$      |
| \f$\vdots\f$         | \f$\vdots\f$         | \f$\vdots\f$  | \f$\vdots\f$ |

Using the original Plonk permutation argument, we *could* impose a copy constraint linking the values of \f$w_1\f$ and \f$w_2\f$ in a given row by setting \f$S_{\sigma,1}(\omega^k) := k_0\omega^{k}\f$ for \f$k=0,\ldots, \numpub-1\f$ (indeed, we do this temporarily  in plonk::ComposerBase::compute_wire_copy_cycles). In that case, the permutation argument would show that
\f[
\frac
{\prod_{k=0}^{\numgates-1}\prod_{j=1}^{\numwires} (w_j(\omega^k) + \beta         \ID_j(\omega^k) + \gamma)}
{\prod_{k=0}^{\numgates-1}\prod_{j=1}^{\numwires} (w_j(\omega^k) + \beta S_{\sigma, j}(\omega^k) + \gamma)}
= 1.
\f]

Instead, we choose an "external coset generator", an element \f$k_\ext\in \bF\f$ such that \f$k_\ext H\f$ is disjoint from \f$H\f$ and every other \f$k_j H\f$, and we define \f$S_{\sigma', 1}\f$ by 
\f{align}{
S_{\sigma', 1}(\omega^k) &= k_\ext \omega^k \qquad k=0,\ldots,\numpub-1 \\
S_{\sigma', 1}(\omega^k) &= S_{\sigma, 1}(\omega^k) \qquad k=\numpub,\ldots,\numgates-1.
\f}
If we factor the above grand product expression as
\f{align}{
\frac
{\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma', 1}(\omega^k) + \gamma}
{\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma , 1}(\omega^k) + \gamma}
\cdot 
\frac
{\prod_{k=0}^{\numpub-1}\pub_k + \beta          \ID_1(\omega^k) + \gamma}
{\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma', 1}(\omega^k) + \gamma}
\cdot 
\frac
{\prod_{k=\numpub}^{\numgates-1} w_1(\omega^k) + \beta         \ID_1(\omega^k) + \gamma}
{\prod_{k=\numpub}^{\numgates-1} w_1(\omega^k) + \beta S_{\sigma, 1}(\omega^k) + \gamma}
\cdot 
\frac
{\prod_{k=0}^{\numgates-1}\prod_{j=2}^{\numwires} w_j(\omega^k) + \beta         \ID_j(\omega^k) + \gamma}
{\prod_{k=0}^{\numgates-1}\prod_{j=2}^{\numwires} w_j(\omega^k) + \beta S_{\sigma, j}(\omega^k) + \gamma}
.
\f}
then we see our strategy. Defining
\f[
\Delta_\PI = 
\frac
{\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma , 1}(\omega^k) + \gamma}
{\prod_{k=0}^{\numpub-1}\pub_k + \beta S_{\sigma', 1}(\omega^k) + \gamma},
\f]
we have a quantitity that is efficiently computable by both the prover and the verifier that can be used to "complete" the permutation argument. Define a modified grand product polynomial by Lagrange interpolation from
\f{align}{
Z(\omega^i) :=
\frac
{\prod_{k=0}^{k} w_1(\omega^i) + \beta         \ID_1(\omega^i) + \gamma}
{\prod_{k=0}^{k} w_1(\omega^i) + \beta S_{\sigma, 1}(\omega^i) + \gamma}
\cdot 
\frac
{\prod_{k=0}^{k}\prod_{j=2}^{\numwires} w_j(\omega^i) + \beta        \ID_j(\omega^i) + \gamma}
{\prod_{k=0}^{k}\prod_{j=2}^{\numwires} w_j(\omega^i) + \beta S_{\sigma, j}(\omega^i) + \gamma}
.
\f}
<!-- We speak of modifying 
\f[\frac
{\prod_{k=0}^{\numpub-1}\pub_k + \beta \ID_1(\omega^k) + \gamma}
{\prod_{k=0}^{\numpub-1}\pub_k + \beta   S_{\sigma, 1}(\omega^k) + \gamma}
\quad
\text{to} 
\quad
\frac
{\prod_{k=0}^{\numpub-1}\pub_k + \beta \ID_1(\omega^k) + \gamma}
{\prod_{k=0}^{\numpub-1}\pub_k + \beta   S_{\sigma', 1}(\omega^k) + \gamma}
\f]
as "breaking" the valid copy cycle.  This is something we explicitly do in plonk::ComposerBase::compute_sigma_permutations. -->
The modified protocol assumes this modified grand product, and adds a relation to enforce that \f$Z(\omega^\numgates) =  \Delta_\PI.\f$

This is computed by the prover in plonk::ProverPermutationWidget::compute_quotient_contribution, and by the verifier in plonk::VerifierPermutationWidget::compute_quotient_evaluation_contribution, via a call to plonk::compute_public_input_delta in both cases.