# Sumcheck
This module holds the implementation of the sumcheck protocol.

The implementation varies depending on the `Flavor` provided as a template parameter. The two main conditions that change the `prove`/`verify` functionality are
1. `IsGrumpkinFlavor` concept, which distinguishes whether coefficients are `Grumpkin` (`ECCVMFlavor`, `ECCVMRecursiveFlavor`) or `BN254` scalars.
2. `hasZK` which determines whether the flavor is a `ZK` Flavor.

# `SumcheckProver`
## Non-ZK sumcheck
This is a fairly standard implementation of the sumcheck protocol utilizing a __book-keeping table__.

The protocol proves/verifies the correctness of a claim
$\sum_{X\in\{0,1\}^d}\tilde{F} = 0$, where $$\tilde{F}(X) = \textsf{pow}_{\beta}(X_0,\dots,X_{d-1}) F(P_1(X), \dots, P_N(X)) = 0$$

to prove that $F(P_1(X),\dots,P_N(X)) = 0$ on points on the hypercube.
Couple things to note:
1. $P_i$'s are multilinear polynomials
2. for $\beta = (\beta_0,\dots, \beta_{d-1})$, $\textsf{pow}_\beta(X)$ is a multilinear polynomial with evaluation $\Pi_{i\in [d]} \beta_i^{X_i}$ for any $X$ on the hypercube.

> note: for all flavors other than `MultiLinearBatchingFlavor` we set the vector $\beta$ to be $(\beta, \beta^2, \dots, \beta^{2^{d}})$. Hence, the evaluation at the $i^{th}$ hypercube edge (i.e. $bin(i)$), is $\beta^i$.

### `SumcheckProver::prove()`
This is the typical sumcheck proving algorithm.
At each round the prover computes a round univariate $$S^i(X_i) = \sum_{\ell\in \{0,1\}^d}F(u_0,\dots,u_{i-1},X_i, \ell_{i+1},\dots,\ell_{d-1})$$

The important observation is that since $P_i$'s are multilinear polynomials, we have the following equality for $\ell \in \{0,1\}^{d-k-1}$:
\begin{align}P_i(u_0,\dots, u_{k-1}, u_k, \ell)=&\\  &u_k\cdot P_i(u_0,\dots,u_{k-1},1,\ell) \\+ &(1-u_k)\cdot P_i(u_0,\dots,u_{k-1},0,\ell)\end{align}

Hence, at round $i$ the prover will keep a __book-keeping table__ of evaluations $P_j(u_0,\dots,u_{i-1},\ell)$ for $\ell$ on the hypercube. In the code these are referred to as `partially_evaluated_polynomials`. The next book-keeping table (for round $i+1$) which has half the size of the one from round $i$, is computed using the equation above.

At the last round the `partially_evaluated_polynomials` only holds the evaluation of the multilinear polynomials at challenge point $u_0,\dots,u_{d-1}$.

Hence, here is how the proving flow goes:
1. The prover initializes the `partially_evaluated_polynomials` with the evaluation of the prover multilinear polynomials ($P_i$) over the hypercube. Note that, since `GateSeperatorPolynomial` ($\textsf{pow}_\beta$) is also a multilinear polynomial, we follow the same logic as other multivariates for it.
- for $d$ rounds:

    2. The prover computes the round univariate $S^i$ by calling `compute_univariate`.
    3. Prover sends the round univariate to the verifier via the `transcript` object.
    3. The prover updates its book-keeping table using `partially_evaluate`.
4. After all the rounds, the prover computes the final evaluation `multivariate_evaluations` by calling the `extract_claimed_evaluations`. This method simply returns the last element left in the book-keeping table after all the rounds which corresponds to $P_i(u_0,\dots,u_{d-1})$.
5. The prover sends these evaluations to the verifier via the `transcript` object

## ZK sumcheck
There are two new subtleties that are introduced when making the proving system zero-knowledge.

1. The sumcheck protocol should be modified so that the round univariates and evaluations don't leak information about the witness
2. The sumcheck protocol should accommodate for randomness added to the end of the witness polynomials.

Let us focus on bullet point 2 first. In order to hide the contribution of witness values in commitments/openings every witness column is appended with 4 random values.
> technically we only need to add 3 random values to each column, but since we require shift of some polynomials we append columns with 4 random values so there are 3 random values at the end of the shifted polynomial

As these values are random, for the sumcheck relation to hold, these values should be canceled. This is where we introduce the concept of `RowDisablingPolynomials`.
### `RowDisablingPolynomials`
Assuming a reverse lexicographic order on the points on the hypercube, we want a polynomial that is $0$ at the following 4 points and $1$ everywhere else.
- $2^{d}-1 = (1,1,1,\dots,1)$, with the lagrange polynomial $L_{2^d-1} = X_0X_1X_2\dots X_{d-1}$
- $2^{d}-2 = (0,1,1,\dots,1)$, with the lagrange polynomial $L_{2^d-2} = (1-X_0)X_1X_2\dots X_{d-1}$
- $2^{d}-3 = (1,0,1,\dots,1)$, with the lagrange polynomial $L_{2^d-3} = X_0(1-X_1)X_2\dots X_{d-1}$
- $2^{d}-4 = (0,0,1,\dots,1)$, with the lagrange polynomial $L_{2^d-4} = (1-X_0)(1-X_1)X_2\dots X_{d-1}$

Hence, the polynomial which is zero on these $4$ points and $1$ everywhere else on the hypercube is
\begin{align}\textsf{RowDisablingPoly} =&1 - (L_{2^d-1} + L_{2^d-2}+ L_{2^d-3} +L_{2^d-4})\\
=& 1- X_2X_3\dots X_{d-1}
\end{align}

Given the definition, the updated sumcheck relation, is:
\begin{align}
\sum_{X\in \{0,1\}^d } F(X)\textsf{RowDisablingPoly}(X) = 0
\end{align}
This affects the sumcheck rounds in 2 ways:
1. The contribution of $\textsf{RowDisablingPoly}$ to the round univariates should be added.
2. The contribution of $\textsf{RowDisablingPoly}$ to the last round's multivariate eval should be added.

Bullet point 2 is quite easy to handle, as the evaluation of the sumcheck multivariate should just be multiplied by $1-u_2\dots u_{d-1}$.


Now let's tackle bullet point 1. Let us refer to the round univariate without taking into consideration the `RowDisablingPoly` as $S_{F,i}$ and the round univariate of the corrected poly $S'_{F,i}$.

Recalling the definition of the round univariates of sumcheck we have that:
\begin{aligned}
S'_{F,i} &= \sum_{\gamma_i\in\{0,1\}} (F\times (1-L))(u_0,\dots,u_{i-1},X,\gamma_{i+1},\dots,\gamma_{d-1}) \\
&= S_F - \sum_{\gamma_i\in\{0,1\}} F\times L(u_0,\dots,u_{i-1},X,\gamma_{i+1},\dots,\gamma_{d-1})
\end{aligned}
For $i=0$, $\Pi$ is only non-zero when for all $i>1$ $\gamma_i =1$ this means:
\begin{aligned}
S'_{F,0}
&= S_F - \sum_{\gamma_1\in\{0,1\}} F\times L(X,\gamma_{1},1,\dots,1) \\
& = S_F - \sum_{\gamma_1\in\{0,1\}} F(X,\gamma_{1},1,\dots,1)
\end{aligned}
for $i=1$,
\begin{aligned}
S'_{F,1}
&= S_F - F\times L(u_0,X,,1,\dots,1)\\
&= S_F - F(u_0,X,1,\dots,1)
\end{aligned}

For $i>1$,
\begin{aligned}
S'_{F,i}
&= S_F - F\times L(u_0,\dots,u_{i-1}X,1,\dots,1)\\
&= S_F - \Pi_{j=2}^{i-1}u_j \times X\times F(u_0,\dots,u_{i-1}X,1,\dots,1)
\end{aligned}


### Computing round univariates:
One important detail is how the round univariates (and the row disabling polynomial contributions are implemented).

To compute the round univariate first we would need to compute the corresponding univariates $P_j\left(u_0,\ldots, u_{i-1}, X_{i} , \vec \ell \right)$, for all prover multilinear polynomials $P_j$, over all $\vec \ell$ on the boolean hypercube.

Note that, $P_j\left(u_0,\ldots, u_{i-1}, X_{i} , \vec \ell \right)$ is already computed for $X_i \in \{0,1\}$ in `PartiallyEvalutedPolynomials` book keeping table. To be able to compute evaluations of this univariate on an arbitrary point $X_i$ we should extend the evaluation table to the max individual degree of the relations in each variable. This is referred to as `MAX_PARTIAL_RELATION_LENGTH` and is specified by the `Flavor`.

This extension is done via the `extend_edges` method. This method uses a barycentric evaluation type algorithm (with specific optimizations for univariates of low degrees).

Computing the final round univariate, from the evaluations of the individual multilinear polynomials is done via the `batch_over_relations` method, which as the name suggests batches the univariate contributions of each multilinear to obtain the final univariate.

The contribution of the `RowDisablingPoly` to the round univariate is done quite similarly using the equalities given in the previous section and can be found in `compute_disabled_contribution` method of the `SumcheckProverRound` method.



### Libra
Now that we have covered removing the contribution of masking randomness in the witness polynomials we move to describing zero-knowledge variant of the sumcheck IOP itself. The approach we take is from [Libra](https://eprint.iacr.org/2019/317.pdf).

The main idea is that for a sumcheck claim $\sum_{x\in\{0,1\}^d} F(x) = 0$ we pick a multivariate polynomial $G(x_0,\dots,x_{d-1})$ and a random challenge $\rho$ and perform a sumcheck protocol for the claim $$\sum_{x\in\{0,1\}^d} (F(x) + \rho G(x)) = \rho\cdot \sum_{x\in\{0,1\}^d} G(x)$$

In the code, we refer to $\rho$ as `libra_challenge` and $\sum_{x\in\{0,1\}^d} G(x)$ as `libra_total_sum`.

The main contribution of Libra is that $G$ can have a very specific structure of form:
\begin{align}
G(X_0,\dots,X_{d-1}) =& a_0 + g_0(X_0) + g_1(X_1) + \dots+ g_{d-1}(X_{d-1})
\end{align}
Where for all $i\in [d-1]$, $g_i$ is a univariate of degree $\ell$ with random coefficients. $\ell$ is computed as the maximum individual degree of each variable in $F$.

So to summarize the extra steps of the protocol,
- Prover generates $g_i$\'s and commits to $G$.
- Verifier sends the `libra_challenge` $\rho$ (done via Fiat-Shamir)
- Prover and verifier engage in the sumcheck protocol for $F+ \rho G$
- in the last round, the verifier asks for openings of both $F$ and $G$ to perform the final evaluation check

Now let us discuss the details of the prover algorithm to include the contributions from the Libra polynomial.
Looking at the definition of the round univariate again, we have that the corrected round univariate (of polynomial $F + \rho G$), is:
\begin{align}
S'_{F,i} &= \sum_{\gamma_j\in\{0,1\}} F(u_0,\dots,u_{i-1},X,\gamma_{i+1},\dots,\gamma_{d-1})  \\
&+\rho\cdot \sum_{\gamma_j\in\{0,1\}} H(u_0,\dots,u_{i-1},X,\gamma_{i+1},\dots,\gamma_{d-1}) \\
&= S_{F,i} + \rho \cdot\sum_{\gamma_j\in\{0,1\}} (a_0 + g_0(u_0)+ \dots+ g_{{i-1}}(u_{i-1})\\&+\rho\cdot\sum_{\gamma_i\in\{0,1\}} \left[g_i(X) + \sum_{i+1}^{d-1}g_j(\gamma_i))\right]
\end{align}
Note that $a(0),g_0(u_0),\dots,g_{i-1}(u_{i-1}),g_i(X_i)$ appear $2^{d-i-1}$ times in the sum.
for $j>i$ for $g_j(0)$ and $g_j(1)$ each appear $2^{d-i-1}/2$ times in the sum. Hence, the equation can be rewritten as:
\begin{align}
S_{F,i}' &= S_{F,i} + \rho \times 2^{d-i-1}[a_0+g_0(u_0) + \dots + g_{i-1}(u_{i-1}) \\
 &+ g_i(X_i) + (g_{i+1}(0) + g_{i+1}(1))/2 + \dots+(g_{d-1}(0) + g_{d-1}(1))/2]
\end{align}


Now let us separate this poly into different chunks.
- let's call $2^{d-i-1}(a_0 + g_0(u_0)+ \dots+ g_{{i-1}}(u_{i-1}))$ as $2^{d-i-1} \textsf{prefix-sum}_i$
- and $2^{d-i-1}\cdot\sum_{i+1}^{d-1}\left(g_j(0)+g_j(1)\right)/2$ as $\textsf{suffix_sum}_i$

Now let us see, how these values should be updated when a new challenge $u_{i+1}$ is received. We have the following two equalities:
\begin{align}
&\textsf{prefix_sum}_{i+1} = (\textsf{prefix_sum}_i)/2 + g_i(u_i)/2^{d-i-2}\\
& \textsf{suffix_sum}_{i+1} = \textsf{suffix_sum}_i/2 - (g_{i+1}(0) + g_{i+1}(1))/2
\end{align}

In the code, the sum of `prefix_sum` and `suffix_sum` are labeled as `libra_running_sum`. The method `update_zk_sumcheck_data` does the updating described above for each round.

Now to wrap up how the contribution of the libra polynomial to the round univariate:
at round $i$:
- the prover takes the $i^{th}$ libra univariate $g_i$ (called `current_column` in the code)
- computes `libra_round_univariate` to be `current_column + libra_running_sum`
- The prover updates the `zk_sumcheck_data`, i.e. computes the new running sum.
- As `libra_round_univariates` is computed as its evaluation over the domain of size `LIBRA_UNIVARIATES_LENGTH`, we run `extend_edges` to extend the evaluation domain.
- After the rounds, the verifier additionally receives `libra_total_sum` and `libra_challege` and adds the correction term $\rho G(u_0,\dots ,u_{d-1})$ to the final evaluation check.

The entirety of this logic can be found in `compute_libra_univariate` method of the `SumcheckProverRound` class.

## ECCVM and committed sumcheck
For the `(ECCVM/ECCVMRecursive)Flavor`, our sumcheck implementation differs from the description given above. The main reason for this is that the individual degrees in ECCVM are way higher than other flavors (22 as opposed to 7 in `UltraFlavor`). Moreover, each coefficient in grumpkin case is represented by 2 field limbs. Hence, this would mean the size of round univariates are $46$ field elements, i.e. $46 \times 16$ field elements. This is a significant increase to the proof size. Moreover, polynomials over grumpkin scalar field, `batch_mul` is significantly cheaper than Barycentric evaluation.

To accommodate for this, we use a version of the Sumcheck Protocol that commits to the round univariates instead of sending them in clear. The prover algorithm is as follows:
- In round $i$:
    - The prover computes the round univariate $S_i$
    - The prover commits to $[S_i]$ and sends the commitment $S_i$, and the evaluations of $S_i(0)$ and $S_i(1)$.

This difference is abstracted away in the `RoundUnivariateHandler<Flavor, IsGrumpkinFlavor>` struct.

Notice that when the template parameter is `true`,  the process round univariate method, adds `Sumcheck:univariate_comm_i`, `Sumcheck:univariate_i_eval_0` and `Sumcheck:univariate_i_eval_1`  to the transcript.

## Sumcheck Prover Summary:
in this section we covered the outline of the sumcheck proving algorithm and some of the optimizations and implementation details.

We covered:
- Non-ZK sumcheck prover algorithm
- ZK Sumcheck
    - `RowDisablingPoly` for removing the contribution of the last 4 rows of witness columns
    - Libra hiding and handling of contribution of `libra_univariates`
- ECCVM specific, committed sumcheck

# Sumcheck Verifier
Now we describe the sumcheck verifier algorithm. In our codebase, we differentiate between the ECCVM case and other cases by abstracting away the verifier round operations in a `SumcheckVerifierRound` class, which is templated based `Flavor` and a `IsGrumpkingFlavor` template parameters.

Here's how the verification algorithm goes for all flavors other than `ECCVMFlavor`
1. The verifier instantiates a `VerifierZKCorrectionHandler`. This struct is in charge of applying the correction required in the zero-knowledge case.
2. The verifier initializes the `target_sum` by adding $\rho\cdot \sum_{x_i\in\{0,1\}} H(x_0,\dots,x_{d-1})$ to the target sum of the round object.
3. For $i \in [d]$, the verifier calls the `process_round` method of the `SumcheckVerifierRound` class which does:
    - recovers the `round_univariate` from the transcript
    - checks that `round_univariate.eval(0) + round_univariate.eval(1) = target_sum`
    - updates the target sum to be `round_univariate.eval(u_i)`, where `u_i` is the round challenge.
    - partially evaluates the $\textsf{pow}_\beta$ polynomial in accordance to the new challenge, i.e. multiplies the current evaluation by $\left( (1-u_i) + u_i\cdot \beta_i\right)$
4. After the rounds are done, the verifier performs the final verification `round.perform_final_verification`
    - The verifier computes the `full_honk_purported_value` (i.e. the evaluation of the relation polynomial) from the evaluations of the multilinear polynomials (subrelations) and the evaluation of the `pow` polynomial.
    - The verifier adds the ZK correction by removing the evaluation of the `RowDisablingPoly` at challenges and the libra `libra_evaluation * libra_challenge` from `full_honk_purported_value`.
    - Finally the verifier asserts that `full_honk_porported_value` is equal to `target_sum` after all rounds are done.


Now let us describe the `ECCVMFlavor` version of the verifier. The only difference in this case is the `process_round` method of the `SumcheckVerifierRound`.
The verifier keeps a list of commitments and expected openings. At round `i+1` they:
- get the evaluation of `round_univariate.eval(0)` and `round_univariate.eval(1)` from the transcript.
- Adds the sum `round_univariate.eval(0) + round_univariate.eval(1)` as the expected evaluation for round `i`

The list of `[(round_uni_commitment, round_uni_expected_eval)]` gets batched and proved in the polynomial commitment scheme.


# Virtual Rounds and Padding in Sumcheck

Finally we describe the virtual rounds mechanism and padding indicator array used to support circuits of varying sizes while maintaining constant proof size and constant recursive verifier circuits.

This is specifically important for recursive proving, since the inner verifier circuit must have a fixed size. However, circuits being verified may have different sizes (different values of `log_n`). To handle this:

1. **Fixed proof size**: All proofs are padded to a maximum size `virtual_log_n` (defined by `CONST_PROOF_SIZE_LOG_N`).
2. **Constant verifier circuit**: The recursive verifier always processes `virtual_log_n` rounds, using padding indicators to conditionally skip verification logic for padded rounds.

## Virtual Rounds

### Definition

Given a circuit with `multivariate_d = log₂(n)` variables, the sumcheck protocol naturally runs for `multivariate_d` rounds. To standardize proof size, we extend this to `virtual_log_n` rounds where `virtual_log_n >= multivariate_d`.

The rounds are categorized as:
- **Real rounds** (indices `0` to `multivariate_d - 1`): Standard sumcheck rounds over the actual polynomials.
- **Virtual/Padding rounds** (indices `multivariate_d` to `virtual_log_n - 1`): Rounds where polynomials are conceptually extended by zero.

### Prover Behavior

#### Non-ZK Flavors
For virtual rounds, the prover computes the round univariate by treating all polynomials as extended by zero:

$$P_i(X_0, \ldots, X_{d-1}) \mapsto P_i(X_0, \ldots, X_{d-1}) \cdot \tau(X_d, \ldots, X_{\text{virtual_log_n} - 1})$$

where $\tau(X_d, \ldots, X_k) = \prod_{j=d}^{k} (1 - X_j)$ is the indicator polynomial that is 1 only on the real rounds range.

given the definition of $\tau$, if any of $l_i$ values are $1$, $\tau$ would evaluate to zero. So the contribution would only be from the

This is implemented in `compute_virtual_contribution`.

#### ZK Flavors
For ZK flavors, the addition of randomness at the end of trace causes issues with the padding. Hence, we take a simpler approach of skipping over the virtual rounds on the verifier side.
In This case the prover sends **zero univariates** to the verifier:
```cpp
auto zero_univariate = bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>::zero();
transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(k), zero_univariate);
```

The prover still generates challenges for these rounds to maintain transcript consistency.

### Verifier Behavior

The verifier processes all `virtual_log_n` rounds uniformly but uses the **padding indicator array** to conditionally apply verification logic.

## Padding Indicator Array
The padding indicator array is computed on the verifier side, to disable the contributions of the `virtual_rounds`.

### Definition

The padding indicator array is a vector of size `virtual_log_n` where:

$$\text{padding_indicator_array}[i] = \begin{cases} 1 & \text{if } i < \text{multivariate_d} \text{ (real round)} \\ 0 & \text{if } i \geq \text{multivariate_d} \text{ (padding round)} \end{cases}$$

### Native vs Recursive Computation

**Native verification**: The array is computed trivially:
```cpp
std::vector<FF> padding_indicator_array(virtual_log_n, 1);
for (size_t idx = multivariate_d; idx < virtual_log_n; idx++) {
    padding_indicator_array[idx] = FF{ 0 };
}
```

**Recursive verification**: The array is computed in-circuit using Lagrange interpolation to ensure constant gate count regardless of the actual `log_n` value. This is implemented in `compute_padding_indicator_array`.

The in-circuit computation:
1. Constrains `log_n` to be in range $[1, \text{virtual_log_n}]$
2. Evaluates Lagrange polynomials $L_i(\text{log_n} - 1)$
3. Computes step functions: $b_i = \sum_{j=i}^{N-1} L_j(\text{log_n} - 1)$

### Usage in Verification

The padding indicator is used to conditionally apply sumcheck verification logic. The following checks are only applied if `padding_indicator_array[i] = 1`

1. **`check_sum`**: Verifying $S^{i-1}(u_{i-1}) = S^i(0) + S^i(1)$ .
2. **`compute_next_target_sum`**: Updating target sum
3. **`gate_separators.partially_evaluate`**: updating gate separator polynomial.
4. **`RowDisablingPolynomial::evaluate_at_challenge`**: applying ZK correction.


## ECCVM/Grumpkin Note

For Grumpkin-based flavors (ECCVM), the padding indicator is **not used** in round processing. Instead, all consistency checks are deferred to the polynomial commitment scheme (Shplemini), which batches and verifies all round univariate commitments together.
