# Sumcheck
This module holds the implementation of the sumcheck protocol.

The implementation varies depending on the `Flavor` provided as a template parameter. The two main conditions that change the `prove`/`verify` functionality are
1. The `CommittedSumcheck` template parameter, by default `UsesCommittedSumcheck<Flavor>` = `IsGrumpkinFlavor<Flavor>` (true for `ECCVMFlavor` and `ECCVMRecursiveFlavor`, whose coefficients are Grumpkin scalars). See [Committed sumcheck](#committed-sumcheck).
2. `HasZK` which determines whether the flavor is a `ZK` Flavor.

# `SumcheckProver`
## Non-ZK sumcheck
This is a fairly standard implementation of the sumcheck protocol utilizing a __book-keeping table__.

The protocol proves/verifies the correctness of a claim
$\sum_{X\in\lbrace 0,1\rbrace^d}\tilde{F} = 0$, where $$\tilde{F}(X) = \textsf{pow}_{\beta}(X_0,\dots,X_{d-1}) F(P_1(X), \dots, P_N(X)) = 0$$

to prove that $F(P_1(X),\dots,P_N(X)) = 0$ on points on the hypercube.
Couple things to note:
1. $P_i$'s are multilinear polynomials
2. for $\beta = (\beta_0,\dots, \beta_{d-1})$, $\textsf{pow}(\beta)(X)$ is a multilinear polynomial with evaluation $\Pi_{i\in [d]} \beta_i^{X_i}$ for any $X$ on the hypercube.

> note: for all flavors other than `MultilinearBatchingFlavor` we set the vector $\beta$ to be $(\beta, \beta^2, \beta^4, \dots, \beta^{2^{D-1}})$, i.e. $\beta_j = \beta^{2^j}$, with $D$ = `VIRTUAL_LOG_N` entries (see [Virtual Rounds](#virtual-rounds-and-padding-in-sumcheck)). Hence, the evaluation at the $i^{th}$ hypercube edge (i.e. $bin(i)$), is $\beta^i$. `MultilinearBatchingFlavor` passes no gate challenges.

### `SumcheckProver::prove()`
This is the typical sumcheck proving algorithm.
At each round the prover computes a round univariate $$S^i(X_i) = \sum_{\ell\in \lbrace 0,1\rbrace^d}F(u_0,\dots,u_{i-1},X_i, \ell_{i+1},\dots,\ell_{d-1})$$

The important observation is that since $P_i$'s are multilinear polynomials, we have the following equality for $\ell \in \lbrace 0,1\rbrace^{d-k-1}$:
$$\begin{align}P_i(u_0,\dots, u_{k-1}, u_k, \ell)=&\\  &u_k\cdot P_i(u_0,\dots,u_{k-1},1,\ell) \\+ &(1-u_k)\cdot P_i(u_0,\dots,u_{k-1},0,\ell)\end{align}$$

Hence, at round $i$ the prover will keep a __book-keeping table__ of evaluations $P_j(u_0,\dots,u_{i-1},\ell)$ for $\ell$ on the hypercube. In the code these are referred to as `partially_evaluated_polynomials`. The next book-keeping table (for round $i+1$) which has half the size of the one from round $i$, is computed using the equation above.

At the last round the `partially_evaluated_polynomials` only holds the evaluation of the multilinear polynomials at challenge point $u_0,\dots,u_{d-1}$.

Hence, here is how the proving flow goes:
1. The prover computes the first round univariate $S^0$ by calling `compute_univariate` on the full polynomials.
2. The prover initializes the `partially_evaluated_polynomials` book-keeping table and performs the first partial evaluation using `partially_evaluate_first_round`. Note that, since `GateSeparatorPolynomial` ($\textsf{pow}_\beta$) is also a multilinear polynomial, we follow the same logic as other multivariates for it.
- for remaining $d-1$ rounds:

    3. The prover computes the round univariate $S^i$ by calling `compute_univariate` on `partially_evaluated_polynomials`.
    4. Prover sends the round univariate to the verifier via the `transcript` object.
    5. The prover updates its book-keeping table in-place using `partially_evaluate_in_place`.
6. After all the rounds, the prover computes the final evaluation `multivariate_evaluations` by calling the `extract_claimed_evaluations`. This method simply returns the last element left in the book-keeping table after all the rounds which corresponds to $P_i(u_0,\dots,u_{d-1})$.
7. The prover sends these evaluations to the verifier via the `transcript` object

## ZK sumcheck
There are two new subtleties that are introduced when making the proving system zero-knowledge.

1. The sumcheck protocol should be modified so that the round univariates and evaluations don't leak information about the witness
2. The sumcheck protocol should accommodate for randomness added to the start of the witness polynomials.

Let us focus on bullet point 2 first. To hide the contribution of witness values in commitments/openings, every masked witness column holds `NUM_MASKED_ROWS` = 3 random values in rows 1..3 (row 0 is the zero row). The first `NUM_DISABLED_ROWS_IN_SUMCHECK` = `NUM_MASKED_ROWS` + 1 = 4 rows (rows 0..3) are disabled in sumcheck (`constants.hpp`).
> The +1 accounts for shifted polynomials (see `constants.hpp`). The first row where relations are active is row 4 (`TRACE_OFFSET`).

As these values are random, for the sumcheck relation to hold, these values should be canceled. This is where we introduce the concept of `RowDisablingPolynomial` (`polynomials/row_disabling_polynomial.hpp`).
### `RowDisablingPolynomial`
Assuming a reverse lexicographic order on the points on the hypercube, we want a polynomial that is $0$ at the following 4 points and $1$ everywhere else.
- $0 = (0,0,0,\dots,0)$
- $1 = (1,0,0,\dots,0)$
- $2 = (0,1,0,\dots,0)$
- $3 = (1,1,0,\dots,0)$

Hence, the polynomial which is zero on these $4$ points and $1$ everywhere else on the hypercube is
$$\begin{align}\textsf{RowDisablingPoly} = 1 - L, \qquad L = L_0 + L_1 + L_2 + L_3 = \prod_{k=2}^{d-1}(1-X_k)
\end{align}$$

Given the definition, the updated sumcheck relation, is:
$$\begin{align}
\sum_{X\in \{0,1\}^d } F(X)\textsf{RowDisablingPoly}(X) = 0
\end{align}$$
This affects the sumcheck rounds in 2 ways:
1. The contribution of $\textsf{RowDisablingPoly}$ to the round univariates should be added.
2. The contribution of $\textsf{RowDisablingPoly}$ to the last round's multivariate eval should be added.

Bullet point 2 is quite easy to handle: the verifier multiplies the evaluation of the sumcheck multivariate by $1 - \prod_{k=2}^{D-1}(1-u_k)$ (`RowDisablingPolynomial::evaluate_at_challenge`).

Now let's tackle bullet point 1. Let us refer to the round univariate without taking into consideration the `RowDisablingPoly` as $S_{F,i}$ and the round univariate of the corrected poly $S'_{F,i}$. Only the edges at the start of the trace contribute to the correction:

- Round 0: $S'_{F,0} = S_{F,0} - F(X,0,\dots,0) - F(X,1,0,\dots,0)$.
- Round 1: $S'_{F,1} = S_{F,1} - F(u_0,X,0,\dots,0)$. The factor $L(u_0,X,0,\dots,0)$ is $1$: `RowDisablingPolynomial` keeps `eval_at_0 = eval_at_1 = 1` until `update_evaluations` runs with `round_idx = 1`.
- Rounds $i>1$: $S'_{F,i} = S_{F,i} - \prod_{k=2}^{i-1}(1-u_k)\cdot(1-X)\cdot F(u_0,\dots,u_{i-1},X,0,\dots,0)$.

The header of `polynomials/row_disabling_polynomial.hpp` derives these formulas.


### Computing round univariates:
One important detail is how the round univariates (and the row disabling polynomial contributions are implemented).

To compute the round univariate first we would need to compute the corresponding univariates $P_j\left(u_0,\ldots, u_{i-1}, X_{i} , \vec \ell \right)$, for all prover multilinear polynomials $P_j$, over all $\vec \ell$ on the boolean hypercube.

Note that, $P_j\left(u_0,\ldots, u_{i-1}, X_{i} , \vec \ell \right)$ is already computed for $X_i \in \lbrace 0,1\rbrace$ in the `partially_evaluated_polynomials` book-keeping table. To be able to compute evaluations of this univariate on an arbitrary point $X_i$ we should extend the evaluation table to the max individual degree of the relations in each variable. This is referred to as `MAX_PARTIAL_RELATION_LENGTH` and is specified by the `Flavor`.

This extension is done via the `extend_edges` method. This method uses a barycentric evaluation type algorithm (with specific optimizations for univariates of low degrees).

Computing the final round univariate, from the evaluations of the individual multilinear polynomials is done via the `batch_over_relations` method, which as the name suggests batches the univariate contributions of each multilinear to obtain the final univariate.

The contribution of the `RowDisablingPoly` to the round univariate is done quite similarly using the equalities given in the previous section and can be found in the `compute_offset_area_contribution` method of `SumcheckProverRound`. The same method also applies the dual `L` factor to any relation tagged `IS_OFFSET_ONLY` (see `IsOffsetOnlyRelation`), which is how boundary constraints on the offset rows 0..3 are enforced.



### Libra
Now that we have covered removing the contribution of masking randomness in the witness polynomials we move to describing zero-knowledge variant of the sumcheck IOP itself. The approach we take is from [Libra](https://eprint.iacr.org/2019/317.pdf).

The main idea is that for a sumcheck claim $\sum_{x\in\lbrace 0,1\rbrace^d} F(x) = 0$ we pick a multivariate polynomial $G(x_0,\dots,x_{d-1})$ and a random challenge $\rho$ and perform a sumcheck protocol for the claim $$\sum_{x\in\lbrace 0,1\rbrace^d} (F(x) + \rho G(x)) = \rho\cdot \sum_{x\in\lbrace 0,1\rbrace^d} G(x)$$

In the code, we refer to $\rho$ as `libra_challenge` and $\sum_{x\in\lbrace 0,1\rbrace^d} G(x)$ as `libra_total_sum`.

The main contribution of Libra is that $G$ can have a very specific structure of form:
$$\begin{align}
G(X_0,\dots,X_{d-1}) =& a_0 + g_0(X_0) + g_1(X_1) + \dots+ g_{d-1}(X_{d-1})
\end{align}$$
Where for all $i\in [d-1]$, $g_i$ is a univariate with random coefficients. Its length is the per-curve constant `LIBRA_UNIVARIATES_LENGTH`: 9 on BN254, and 4 on Grumpkin, where the committed-sumcheck masking budget sets it (see [Committed sumcheck masking budget](#committed-sumcheck-masking-budget)). The prover generates Libra univariates for all $D$ = `VIRTUAL_LOG_N` rounds.

So to summarize the extra steps of the protocol,
- Prover generates $g_i$\'s and commits to $G$.
- Verifier sends the `libra_challenge` $\rho$ (done via Fiat-Shamir)
- Prover and verifier engage in the sumcheck protocol for $F+ \rho G$
- in the last round, the verifier asks for openings of both $F$ and $G$ to perform the final evaluation check

Now let us discuss the details of the prover algorithm to include the contributions from the Libra polynomial.
Looking at the definition of the round univariate again, we have that the corrected round univariate (of polynomial $F + \rho G$), is:
$$\begin{align}
S'_{F,i} &= \sum_{\gamma_j\in\{0,1\}} F(u_0,\dots,u_{i-1},X,\gamma_{i+1},\dots,\gamma_{d-1})  \\
&+\rho\cdot \sum_{\gamma_j\in\{0,1\}} G(u_0,\dots,u_{i-1},X,\gamma_{i+1},\dots,\gamma_{d-1}) \\
&= S_{F,i} + \rho \cdot\sum_{\gamma_j\in\{0,1\}} (a_0 + g_0(u_0)+ \dots+ g_{{i-1}}(u_{i-1})\\&+\rho\cdot\sum_{\gamma_i\in\{0,1\}} \left[g_i(X) + \sum_{i+1}^{d-1}g_j(\gamma_i))\right]
\end{align}$$
Note that $a(0),g_0(u_0),\dots,g_{i-1}(u_{i-1}),g_i(X_i)$ appear $2^{d-i-1}$ times in the sum.
for $j>i$ for $g_j(0)$ and $g_j(1)$ each appear $2^{d-i-1}/2$ times in the sum. Hence, the equation can be rewritten as:
$$\begin{align}
S_{F,i}' &= S_{F,i} + \rho \times 2^{d-i-1}[a_0+g_0(u_0) + \dots + g_{i-1}(u_{i-1}) \\
 &+ g_i(X_i) + (g_{i+1}(0) + g_{i+1}(1))/2 + \dots+(g_{d-1}(0) + g_{d-1}(1))/2]
\end{align}$$


Now let us separate this poly into different chunks.
- let's call $2^{d-i-1}(a_0 + g_0(u_0)+ \dots+ g_{{i-1}}(u_{i-1}))$ as $2^{d-i-1} \textsf{prefix-sum}_i$
- and $2^{d-i-1}\cdot\sum_{i+1}^{d-1}\left(g_j(0)+g_j(1)\right)/2$ as $\textsf{suffix sum}_i$

Now let us see, how these values should be updated when a new challenge $u_{i+1}$ is received. We have the following two equalities:
$$\begin{align}
&\textsf{prefix\_sum}_{i+1} = (\textsf{prefix\_sum}_i)/2 + g_i(u_i)/2^{d-i-2}\\
& \textsf{suffix\_sum}_{i+1} = \textsf{suffix\_sum}_i/2 - (g_{i+1}(0) + g_{i+1}(1))/2
\end{align}$$

In the code, the sum of `prefix_sum` and `suffix_sum` are labeled as `libra_running_sum`. The method `update_zk_sumcheck_data` does the updating described above for each round.

Now to wrap up how the contribution of the libra polynomial to the round univariate:
at round $i$:
- the prover takes the $i^{th}$ libra univariate $g_i$ (called `current_column` in the code)
- computes `libra_round_univariate` to be `current_column + libra_running_sum`
- The prover updates the `zk_sumcheck_data`, i.e. computes the new running sum.
- As `libra_round_univariates` is computed as its evaluation over the domain of size `LIBRA_UNIVARIATES_LENGTH`, we run `extend_edges` to extend the evaluation domain.
- After the rounds, the verifier additionally receives `libra_total_sum` and `libra_challenge` and adds the correction term $\rho G(u_0,\dots ,u_{d-1})$ to the final evaluation check.

The entirety of this logic can be found in `compute_libra_univariate` method of the `SumcheckProverRound` class.

## Committed sumcheck
Committed sumcheck is selected by the `CommittedSumcheck` template parameter of `RoundUnivariateHandler` and `SumcheckVerifierRound`. Two provers use it:
- ECCVM (`ECCVMFlavor`, `ECCVMRecursiveFlavor`), by default through `UsesCommittedSumcheck<Flavor> = IsGrumpkinFlavor<Flavor>`.
- The joint MegaZK + Translator sumcheck in `chonk/batched_honk_translator/` (BN254), which sets `UseCommittedSumcheck = true`.

For ECCVM, the individual degrees are much higher than in other flavors (`MAX_PARTIAL_RELATION_LENGTH` = 22 in `ECCVMFlavor`, against 7 in `UltraFlavor`). Moreover, each coefficient in the Grumpkin case is represented by 2 field limbs. A round univariate of `BATCHED_RELATION_PARTIAL_LENGTH` = 24 evaluations takes 48 field elements, for each of the `CONST_ECCVM_LOG_N` = 15 rounds. This is a significant increase to the proof size. Moreover, for polynomials over the Grumpkin scalar field, `batch_mul` is significantly cheaper than barycentric evaluation.

To accommodate for this, we use a version of the Sumcheck Protocol that commits to the round univariates instead of sending them in clear. The prover algorithm is as follows:
- In round $i$:
    - The prover computes the round univariate $S_i$
    - The prover commits to $[S_i]$ and sends the commitment $S_i$, and the evaluations of $S_i(0)$ and $S_i(1)$.

Notice that when the template parameter is `true`,  the process round univariate method, adds `Sumcheck:univariate_comm_i`, `Sumcheck:univariate_i_eval_0` and `Sumcheck:univariate_i_eval_1`  to the transcript.

The round-univariate opening claims go to the PCS: ECCVM reduces them with TripleIPA, and the joint MegaZK + Translator proof passes them to Shplemini.

### Committed sumcheck masking budget
In committed sumcheck, the verifier's view exposes 3 Libra-sensitive functionals of each round univariate $U_i$: its evaluation $U_i(0)$, the chained target $T_{i+1} = U_i(u_i)$, and the commitment $[U_i]$. The pair-sum bookkeeping $U_i(0) + U_i(1) = T_i$ consumes one Libra coefficient. So the Libra masking univariates must have length 3 + 1 = 4: `LIBRA_UNIVARIATES_LENGTH` = 4 on Grumpkin, checked by a `static_assert` in `eccvm/eccvm_flavor.hpp`. The concatenated Libra polynomial must fit in the SmallSubgroupIPA subgroup: `CONST_ECCVM_LOG_N` · 4 + 1 = 61 < `SUBGROUP_SIZE` = 87.

# Sumcheck Verifier
Now we describe the sumcheck verifier algorithm. In our codebase, we differentiate between the ECCVM case and other cases by abstracting away the verifier round operations in a `SumcheckVerifierRound` class, which is templated on `Flavor` and a `CommittedSumcheck` template parameter.

Here's how the verification algorithm goes without committed sumcheck
1. The verifier instantiates a `VerifierZKCorrectionHandler`. This struct is in charge of applying the correction required in the zero-knowledge case.
2. The verifier initializes the `target_sum` by adding $\rho\cdot \sum_{x_i\in\lbrace 0,1\rbrace} G(x_0,\dots,x_{d-1})$ to the target sum of the round object.
3. For $i \in [d]$, the verifier calls the `process_round` method of the `SumcheckVerifierRound` class which does:
    - recovers the `round_univariate` from the transcript
    - checks that `round_univariate.eval(0) + round_univariate.eval(1) = target_sum`
    - updates the target sum to be `round_univariate.eval(u_i)`, where `u_i` is the round challenge.
    - partially evaluates the $\textsf{pow}_\beta$ polynomial in accordance to the new challenge, i.e. multiplies the current evaluation by $\left( (1-u_i) + u_i\cdot \beta_i\right)$
4. After the rounds are done, the verifier performs the final verification `round.perform_final_verification`
    - The verifier computes the `full_honk_purported_value` (i.e. the evaluation of the relation polynomial) from the evaluations of the multilinear polynomials (subrelations) and the evaluation of the `pow` polynomial.
    - The verifier adds the ZK correction by removing the evaluation of the `RowDisablingPoly` at challenges and the libra `libra_evaluation * libra_challenge` from `full_honk_purported_value`.
    - Finally the verifier asserts that `full_honk_purported_value` is equal to `target_sum` after all rounds are done.


Now let us describe the committed-sumcheck version of the verifier. The only difference in this case is the `process_round` method of the `SumcheckVerifierRound`.
The verifier keeps a list of commitments and expected openings. At round `i+1` they:
- get the evaluation of `round_univariate.eval(0)` and `round_univariate.eval(1)` from the transcript.
- Adds the sum `round_univariate.eval(0) + round_univariate.eval(1)` as the expected evaluation for round `i`

The list of `[(round_uni_commitment, round_uni_expected_eval)]` gets batched and proved in the polynomial commitment scheme.


# Virtual Rounds and Padding in Sumcheck

Finally we describe the virtual rounds mechanism used to support circuits of varying sizes while maintaining constant proof size and constant recursive verifier circuits.

This is specifically important for recursive proving, since the inner verifier circuit must have a fixed size. However, circuits being verified may have different sizes (different values of `log_n`). To handle this:

1. **Fixed proof size**: All proofs are padded to a maximum size `virtual_log_n` = `Flavor::VIRTUAL_LOG_N`.
2. **Constant verifier circuit**: The recursive verifier always processes `virtual_log_n` rounds uniformly.

| Flavor | `VIRTUAL_LOG_N` |
|---|---|
| `UltraFlavor` (and the Ultra ZK/Keccak variants) | `CONST_PROOF_SIZE_LOG_N` = 25 |
| `MegaFlavor`, `MegaAppFlavor`, `MegaKernelFlavor`, `MultilinearBatchingFlavor` | `CONST_FOLDING_LOG_N` = 24 |
| `MegaZKFlavor` | `HIDING_KERNEL_LOG_N` = 16 |
| `MegaAvmFlavor` | `MEGA_AVM_LOG_N` = 21 |
| `TranslatorFlavor` | `CONST_TRANSLATOR_LOG_N` = 17 |
| `ECCVMFlavor` | none: the circuit has the fixed size $2^{15}$ (`CONST_ECCVM_LOG_N` = 15), so there are no virtual rounds |

The gate-challenge vector $\beta$ and the Libra univariates both have `VIRTUAL_LOG_N` entries (`CONST_ECCVM_LOG_N` for ECCVM).

## Virtual Rounds

### Definition

Given a circuit with `multivariate_d = log₂(n)` variables, the sumcheck protocol naturally runs for `multivariate_d` rounds. To standardize proof size, we extend this to `virtual_log_n` rounds where `virtual_log_n >= multivariate_d`.

The rounds are categorized as:
- **Real rounds** (indices `0` to `multivariate_d - 1`): Standard sumcheck rounds over the actual polynomials.
- **Virtual/Padding rounds** (indices `multivariate_d` to `virtual_log_n - 1`): Rounds where polynomials are conceptually extended by zero.

### Prover Behavior

For virtual rounds, the prover computes the round univariate by treating all polynomials as extended by zero:

$$P_i(X_0, \ldots, X_{d-1}) \to P_i(X_0, \ldots, X_{d-1}) \cdot \tau(X_d, \ldots, X_{\text{virtual log n} - 1})$$

where $\tau(X_d, \ldots, X_k) = \prod_{j=d}^{k} (1 - X_j)$ is the indicator polynomial that is 1 only on the real rounds range.

On the hypercube, $\tau$ is 1 only when $X_d = \dots = X_{D-1} = 0$. So a virtual round univariate comes only from the edge where all virtual variables are 0.

This is implemented in `compute_virtual_contribution`.

ZK flavors extend by zero in the same way: `prove(ZKData&)` calls `compute_virtual_round_univariate` (`sumcheck.hpp`), which applies the row-disabling factor to `compute_virtual_contribution`; no zero univariates are sent. In each virtual round the prover also adds the Libra univariate (`compute_libra_univariate`), and keeps updating the row-disabling polynomial and `zk_sumcheck_data`. It draws the round challenge `Sumcheck:u_i` as in a real round. The row-disabling polynomial does not depend on the circuit size, so the verifier evaluates $1 - \prod_{k\ge 2}(1-u_k)$ over all $D$ challenges.

### Verifier Behavior

The verifier processes all `virtual_log_n` rounds uniformly — all rounds apply `check_sum`, `compute_next_target_sum`, and `gate_separators.partially_evaluate` unconditionally.
