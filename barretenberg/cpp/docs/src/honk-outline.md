# Minimal Sketch / Outline of Honk

The goal here is to succinctly describe Honk without zero knowledge and using a simple version of Gemini in a way that will feel familiar (I hope) to those who have spent time with the Plonk paper. To that end, I black box / am imprecise about some of the more complex constructions. The description here was based off of: Adrian's thesis, the Plonk paper, and Tohru's most basic description of Gemini.

This is a rough draft. Feel free to add and/or comment, but please don't increase the scope too much.

Some notation:
\f$n = 2^d\f$, \f$H = \{0,1\}\f$

We extend our common notations by defining \f$[F]_1 := \comGem(F)\f$ for \f$F\f$ a multivariate polynomial and \f$[f]_1 := \comKZG(f)\f$ for \f$f\f$ a univariate polynomial.

# SRS
We need an SRS where the \f$i\f$-th element is \f$[x^i]_1\f$.

# Preprocessing
- Commit to selectors \f$q_{m,l,r,o,c}\f$.
- Commit to permutation polynomials \f$T_{1,2,3}\f$.
- _Optional_: Commit to \f$L_0\f$, \f$\mathrm{ID} = [0,1,\ldots,n-1]\f$ to simplify verifier

# Prover
- Commit to wires \f$w_{1,2,3}\f$.
- CHALLENGE: \f$\beta, \gamma\f$
- Generate permutation grand product polynomial \f$\zperm\f$, modified to include public inputs as described [here](https://raw.githubusercontent.com/arielgabizon/plonk-addendum/master/plonk-pubinputs.pdf), and commit to it. (The protocol does not require commitment to the left shift of \f$\zperm\f$.)
- CHALLENGE: \f$\zeta, \alpha\f$
- Sumcheck the Honk constraint polynomial \f$ \Honk = \pow_\zeta \cdot (\Honk_\arith + \alpha \Honk_{\perm, 1} + \alpha^2 \Honk_{\perm, 2})\f$
  - For \f$\ell\f$ from \f$d\f$ to \f$1\f$:
    - Construct univariate \f$S_\ell\f$ and output coefficients (or evals? Rep TBD)
    - CHALLENGE: \f$u_\ell\f$
    - Partially evaluate multivariate.
  - Send multilinear evaluations (at \f$u\f$) \f$\bar q_{m,l,r,o,c}\f$, \f$\overline{T}_{1,2,3}\f$, \f$\overline{\zperm}\f$, \f$\bar{ w}_{l,r,o}\f$, (\f$\bar{L}_0\f$, \f$\overline{\mathrm{ID}}\f$), and evaluation of the left shift of \f$\overline{\zperm}\f$. 
    - Relabel the evaluations to \f$v_0,\ldots,v_{13},v_{14}^{\shift}\f$, and polynomials to \f$F_0, \ldots, F_{13}, F^{\shift}_{14}\f$, where \f$F^{\shift}_{14} = \GP\f$.
- Gemini:
  - **Note 1**: In what follows, the superscript \f$\cdot^\shift\f$ when decorating an evaluation implies the evaluation of a shifted polynomial. When applied to a polynomial, it implies the polynomial is *to-be-shifted*. (TODO: make this less confusing..)
  - **Note 2**: Although \f$d+1\f$ \f$\Fold\f$ polynomials and their evaluations are computed during the prover portion of Gemini, only \f$d-1\f$ commitments and \f$d\f$ evaluations are added to the transcript. This is sufficient for the verifier to reconstruct the remaining components.
  - **Note 3**: In implementation, the Gemini portion of the prover protocol is broken into two "rounds" to facilitate computation of the \f$\Fold\f$ polynomial commitments in the `work_queue` prior to generation of challenge \f$r\f$.
  - **Note 4**: In the Gemini code, the \f$\Fold\f$ polynomials are sometimes denoted by \f$A\f$, i.e. `A_l`. (TODO: fix this)
  - CHALLENGE: \f$\rho\f$ for batching the evaluations
  - Compute folded polynomials \f$\Fold^{(0)}, \ldots, \Fold^{(d-1)}\f$:
    - Compute batched polynomials \f$F = \sum_{i=0}^{13} \rho^i F_i\f$ and \f$G = \rho^{14} F^\shift_{14}\f$
    - \f$\Fold^{(0)}_i = F_i + G_{i+1}\f$ for \f$i=0,1,\ldots,{n-1}\f$ (letting \f$G_n =0\f$), i.e. \f$\Fold^{(0)}\f$ is the sum of \f$F\f$ and the *left shift* of \f$G\f$
    - \f$\Fold^{(\ell+1)} = \GeminiFold(\Fold^{(\ell)}, u_\ell)\f$ for \f$\ell = 0,\ldots, d-1\f$
    - See [here](https://hackmd.io/VpdZslmHRy-j11qnkebLnA?view) for details and discussion of the Gemini Fold operation
  - Commit to \f$\Fold^{(1)}, \ldots, \Fold^{(d-1)}\f$
  - Add \f$d-1\f$ commitments to transcript: \f$[\Fold^{(1)}], \ldots, [\Fold^{(d-1)}]\f$
  - CHALLENGE: \f$r\f$
  - Compute partially evaluated folded polynomials
    \f$\Fold^{(0)}_{r} = F + \tfrac{1}{r}G\f$ and \f$\Fold^{(0)}_{-r} = F + \tfrac{1}{-r}G\f$
  - Compute \f$d+1\f$ univariate evaluations 
    \f$\begin{gathered}
    a_{0}^+ = \Fold^{(0)}_{r}(r) \\
    a_{0} = \Fold^{(0)}_{-r}(-r) \\
    a_{1} = \Fold^{(1)}(-r^{2}) \\
    \ldots \\
    a_{d-1} = \Fold^{(d-1)}(-r^{2^{d-1}})
    \end{gathered}\f$
  - Add \f$d\f$ evaluations to transcript: \f$a_0, \ldots, a_{d-1}\f$
  
- Shplonk (simplifed):
    - CHALLENGE: \f$\nu\f$ for batching the quotients
    - Compute and commit to batched quotient 
        \f$ Q(X) = \frac{\Fold^{(0)}_{r}(X) - a_{0}^+}{X-r} + \nu\frac{\Fold^{(0)}_{-r}(X) - a_{0}}{X+r} + \sum_{\ell=1}^{d-1} \nu^{\ell+1} \frac{\Fold^{(\ell)}(X) - a_{\ell}}{X+r^{2^{\ell}}}\f$
    - CHALLENGE: \f$z\f$ 
    - Compute the partial evaluation at \f$z\f$ of polynomial \f$Q\f$ 
        \f$ Q_z(X) =  \frac{\Fold^{(0)}_{r}(X) - a_{0}^+}{z-r} + \nu\frac{\Fold^{(0)}_{-r}(X) - a_{0}}{z+r} + \sum_{\ell=1}^{d-1} \nu^{\ell+1} \frac{\Fold^{(\ell)}(X) - a_{\ell}}{z+r^{2^{\ell}}}\f$
    - Compute the quotient polynomial
        \f$ W(X) = \frac{Q(X)-Q_z(X)}{X-z}\f$

    

# Verifier
- Validate commmitments lie on curve and validate that evaluations lie in field.
- Compute challenges.
- Compute \f$\pow_\zeta(u)\f$, \f$\idx(u)\f$, \f$L_2(u)\f$.
- Sumcheck: Set \f$\sigma_d = 0\f$. 
  - For \f$\ell\f$ from \f$d\f$ to \f$1\f$:
    - Check \f$\sigma_\ell = S_\ell(0) + S_\ell(1)\f$
    - Evaluate \f$S_\ell\f$ at challenge to get \f$\sigma_{\ell-1}\f$ for \f$\ell > 1\f$.
  - Check that \f$\sigma_0 = \pow_\zeta(u) (\overline{\Honk}_\arith +
                                          \alpha \overline{\Honk}_{\perm, 1} + \alpha^2 \overline{\Honk}_{\perm, 2})\f$, 
    where each \f$\overline{\Honk}_\star\f$ is the expected value of \f$\Honk_\star\f$ given the purported (i.e., provider-supplied) and verifier-computed evaluations of the components. This uses all of the sumcheck evaluations as well as \f$\idx(u)\f$ and \f$L_2(u)\f$.
- Set \f$v = \sum_{i=0}^{13} \rho^i v_i + \rho^{14}v^\shift_{14}\f$ as the batched multi-linear evaluation
- Compute simulated folded commitments 
    \f$  [\Fold^{(0)}_{r}] = [F] + \tfrac{1}{r}[G], [\Fold^{(0)}_{-r}] = [F] + \tfrac{1}{-r}[G],\f$
    where \f$[F] = \sum_{i=0}^{13} \rho^i [F_i]\f$ and \f$[G] = \rho^{14} [F^\shift_{14}]\f$
- Compute purported evaluation of \f$\Fold^{(0)}(r)\f$ as \f$a_{0}^+ = \GeminiUnfold(u, r, a_{0},\ldots,a_{d-1},v)\f$
- See [here](https://hackmd.io/VpdZslmHRy-j11qnkebLnA?view) for details of the Gemini verifier *unfold* operation
- Compute simulated commitment to \f$[Q_z]\f$ 
    \f[
      [Q_z] =  \frac{[\Fold^{(0)}_{r}] - a_{0}^+[1]}{z-r} + \nu\frac{[\Fold^{(0)}_{-r}] - a_{0}[1]}{z+r} + \sum_{\ell=1}^{d-1} \nu^{\ell+1} \frac{[\Fold^{(\ell)}] - a_{\ell}[1]}{z+r^{2^{\ell}}}
      \f]

- Check that 
   \f$ e([Q] - [Q_z] + z[W], [1]_2)  = e([W], [x]_2) \f$
       (or rearrange for efficiency as in the Plonk paper).


-------------------------------------------------------------------------------------------



Here is a table representing the prover's algorithm:


| protocol                    | transcript                                                                      | challenge                       |
|-----------------------------|---------------------------------------------------------------------------------|---------------------------------|
| Commit to wires             | \f$[w_l]_1\f$, \f$[w_r]_1\f$, \f$[w_o]_1\f$                                                 |                                 |
|                             |                                                                                 | \f$\beta, \gamma\f$                 |
| Compute grand product polys | \f$[\GP]_1\f$                                                     |                                 |
|                             |                                                                                 | \f$\zeta\f$, \f$\alpha\f$               |
| Sumcheck Round \f$1\f$          | \f$S_{d}(X)\f$                                                                      |                                 |
|                             |                                                                                 | \f$u_d\f$                           |
|                             | \f$\vdots\f$                                                                        | \f$\vdots\f$                        |
| Sumcheck Round \f$d\f$          | \f$S_{1}(X)\f$                                                                      |                                 |
|                             |                                                                                 | \f$u_1\f$                           |
| Sumcheck evaluations          | \f$\bar q_{m,l,r,o,c}\f$, \f$\bar T_{1,2,3}\f$, \f$\bar S^{\_, \shift}\f$, \f$\bar w_{l,r,o}\f$ |                                 |
|                             |                                                                                 | \f$\rho\f$ |
| Gemini folding              | \f$[\Fold^{(1)}]_1\f$,..., \f$[\Fold^{(d-1)}]_1\f$                                            |                                 |
|                             |                                                                                 | \f$r\f$                             |
| Gemini evaluations              | \f$a_0, \ldots,a_{d-1}, \hat{a}_{0}, [\Fold_r^{(0)}], [\Fold_{-r}^{(0)}]\f$                                            |                                 |
|                             |                                                                                 | \f$\nu\f$                             |
| Shplonk opening                 | \f$[Q]_1\f$                                     |                                 |
|                             |                                                                                 | \f$z\f$                        |
| KZG quotient                 | \f$[W]_1\f$                                     |                                 |
