# Sumcheck
This module holds the implementation of the sumcheck protocol.

The implementation varies depending on the `Flavor` provided as a template parameter. The two main conditions that change the `prove`/`verify` functionality are
1. `IsGrumpkinFlavor` concept, which distinguishes between the `ECCVMFlavor`, `ECCVMRecursiveFlavor` and the rest
2. `hasZK` which determines whether the flavor is a `ZK` Flavor.

## Non-ZK sumcheck
This is a fairly standard implementation of the sumcheck protocol utilizing a __book-keeping table__.

The protocol proves/verifies the correctness of a claim
$\sum_{X\in\{0,1\}^d}F = 0$, where $F(X) = \textsf{pow}_{\beta}(X_0,\dots,X_{d-1}) F(P_1(X), \dots, P_N(X)) = 0 $

to prove that $F(P_1(X),\dots,P_N(X)) = 0$ on points on the hypercube.
Couple things to note:
1. $P_i$'s are multilinear polynomials
2. for $\beta = (\beta_0,\dots, \beta_{d-1})$, $\textsf{pow}_\beta(X)$ is a multilinear polynomial with evaluation $\Pi_{i\in [d]} \beta_i^{X_i}$ for any $X$ on the hypercube.

> note: for all flavors other than `MultiLinearBatchingFlavor` we set the vector $\beta$ to be $(\beta, \beta^2, \dots, \beta^{2^{d}})$. Hence, the evaluation at the $i^{th}$ hypercube edge (i.e. $bin(i)$), is $\beta^i$.

### `SumcheckProver::prove()`
This is the typical sumcheck proving algorithm.
At each round the prover computes a round univariate $$S^i(X_i) = \sum_{\ell\in \{0,1\}^d}F(u_0,\dots,u_{i-1},X_i, \ell_{i+1},\dots,\ell_{d-1})$$

The important observation is that since $P_i$'s are multilinear polynomials, we have the following equality for $\ell \in \{0,1\}^{d-k-1}$:
$$P_i(u_0,\dots, u_{k-1}, u_k, \ell) = u_k\cdot P_i(u_0,\dots,u_{k-1},1,\ell) + (1-u_k)\cdot P_i(u_0,\dots,u_{k-1},0,\ell)$$

Hence, at round $i$ the prover will keep a __book-keeping table__ of evaluations $P_j(u_0,\dots,u_{i-1},\ell)$ for $\ell$ on the hypercube. In the code these are refered to as `partially_evaluated_polynomials`. The next book-keeping table (for round $i+1$) which has half the size of the one from round $i$, is computed using the equation above.

At the round the `partially_evaluated_polynomials` only holds the evaulation of the multilinear polynomials at challenge point $u_0,\dots,u_{d-1}$.

Hence, here is how the proving flow goes:
1. The prover initializes the `partially_evaluated_polynomials` with the evaluation of the prover multilinear polynomials ($P_i$) over the hypercube. Note that, since `GateSeperatorPolynomial` ($\textsf{pow}_\beta$) is also a multilinear polynomial, we follow the same logic as other multivariates for it.
- for $d$ rounds:

    2. The prover computes the round univariate $S^i$ by calling `compute_univariate`.
    3. Prover sends the round univariate to the verifier via the `transcript` object.
    3. The prover updates its book-keeping table using `partially_evaluate`.
4. After all the rounds, the prover compute the final evaluation `multivariate_evaluations` by calling the `extract_claimed_evaluations`. This method simply returns the last element left in the book-keeping table after all the rounds which corresponds to $P_i(u_0,\dots,u_{d-1})$.
5. The prover sends these evaluations to the verifier via the `transcript` object

## ZK sumcheck
There are two new subtelties that are introduced when making the proving system zero-knowledge.
1. The sumcheck protocol should be modified so that the round univariates and evaluations don't leak information about the witness
2. The sumcheck protocol should accomodate for randomness added to the end of the witness polynomials
