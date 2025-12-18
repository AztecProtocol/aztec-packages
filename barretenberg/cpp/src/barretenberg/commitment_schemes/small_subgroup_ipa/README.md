# Small Subgroup IPA

A curve-agnostic zero-knowledge protocol for proving inner products of small vectors.

## Overview

SmallSubgroupIPA enables proving statements of the form $ \langle F, G \rangle = s$ where:
- $ G$ is a witness polynomial (prover's secret)
- $ F$ is a challenge polynomial (derived from public challenges)
- $ s$ is the claimed inner product

This protocol is used in two contexts:
1. **ZK-Sumcheck**: Proving correct evaluation of Libra masking polynomials
2. **ECCVM Translation**: Proving translation data consistency

## Motivation

In ZK-Sumcheck, the prover masks the multivariate polynomial by adding a Libra hiding polynomial:
$$\rho \cdot H(x_0,\dots,x_{d-1})$$

This polynomial has a **separable structure**:
$$H(x_0,\dots,x_{d-1}) = c + \sum_{i=0}^{d-1} H_i(x_i)$$

where $c$ is a constant and each $H_i$ is a univariate polynomial (the "Libra univariates").

### The Inner Product Formulation

To open $H$ at the sumcheck challenge point $(u_0,\dots,u_{d-1})$, we observe:
$$H(u_0,\dots,u_{d-1}) = c + \sum_{i=0}^{d-1} H_i(u_i) = \langle F, G \rangle$$

where:
- **$G$** = polynomial whose Lagrange coefficients over subgroup $H$ are the concatenation of $(c, \text{coeffs}(H_0), \text{coeffs}(H_1), \ldots, \text{coeffs}(H_{d-1}))$, where $\text{coeffs}(H_i)$ denotes the monomial coefficients of $H_i$
- **$F$** = challenge polynomial with Lagrange coefficients $(1, 1, u_0, u_0^2, \ldots, 1, u_1, u_1^2, \ldots)$ over $H$ (check the protocol description for the formal definitions of $G$ and $F$).

The inner product $\langle F, G \rangle$ computes $c \cdot 1 + H_0(u_0) + H_1(u_1) + \cdots = H(u_0, \ldots, u_{d-1})$.

### Why This Approach?

Instead of:
1. Committing to $H$ as a multilinear polynomial (expensive: size $2^d$)
2. Opening $H$ at $(u_0, \ldots, u_{d-1})$ via Gemini/Shplemini

We:
1. Commit to the concatenated polynomial $G$ (small: size $\approx d \cdot L$ where $L$ = `LIBRA_UNIVARIATES_LENGTH`)
2. Prove $\langle F, G \rangle = s$ using SmallSubgroupIPA (leverages small multiplicative subgroup)

This is efficient because $|G| \leq |H|$ (the subgroup size), avoiding the blowup.

## Protocol Description

# inner products using KZG with zk and linear time verifier

The construction here is used
as a component in [zk honk](https://hackmd.io/aQgy7oX5Rwq3cz75qPlJ4g).

## Setting:
Fix integer parameter $m$.
We want a
- Commitment algorithm $(u,r)->com_r(u)$. Where $u\in F^m, r\in F^2$. ($r$ is the randomness of the commitment scheme.)

- Opening protocol $open(c,v,s;u,r)$
where $v\in F^m$ and $s\in F$.
 *(inputs after semicolon only known to $P$)*.

Such that:
(semi-formally)
**knowledge soundness:** If $V$ accepts in $open(c,v,s)$ then $P$ knows $u\in F^m,r$ with $com_r(u)=c$ and $<u,v>=s$.

**zero-knowledge:** A simulator knowing only $c,v,s$ and the PCS trapdoor $\tau$ (but not $u$), can efficiently simulate the transcript. In other words, nothing is leaked about $u$.


**context:** This construction is for situations where we care about zk, but $m$ is small enough that we can afford $V$ to run in $O(m)$ field ops. (In zk honk $m$ will be $d\log n$ where $d$ is the constraint degree).


**Notation:**
Let $H$ be a subgroup of size $m+1$, with generator $\omega$, Lagrange basis $L_1(X),\ldots,L_{m+1}(X)$ and vanishing polynomial $Z_H(X)$. Let $cm$ be a commitment scheme for polys of degree at most $n$ for some $n\geq m+3$ (e.g. KZG).


$cm(u,r)$:
1. Let $G(X)= \sum_{i=1}^{m} u_i L_i(X) + Z_H(X)(r_0 + r_1\cdot X)$. Then $com_r(u)=cm(G)$

We refer to the polynomial encoding $v$ as $F(X) = \sum_i v_iL_i(X)$.

$open(c,v,s;u,r)$:
1. Define the vector $A$ by, $A_0=0$, for $i=1,\ldots,m$, $a_i=\sum_{j<i} u_j\cdot v_j$.
2.  $P$ chooses a random degree two polynomial $R(X)$. Let $A(X):=\sum_{i=1}^{m+1}A_i L_i(X)+ Z_H(X)R(X)$. $P$ computes and sends $cm(A)$.
3. Let $G(X)$ be the polynomial computed in the description of $com_r(u)$.

    $P$ needs to show that for:
    - $i=0$: $A(g^0) = A(1) = 0$
    - $0 < i \leq m$: $A(g^i) = A(g^{i-1}) + F(g^{i-1})G(g^{i-1})$
    - $i=m$: $A(g^m) = s$

    where $g$ is the subgroup generator. The second condition at $X = g^{i-1}$ becomes $A(gX) = A(X) + F(X)G(X)$, which vanishes at all points except $X = g^{-1}$ (the last element). Thus the following polynomial is zero on the whole subgroup:

$$\begin{aligned}
C(X) =\; & L_1(X) A(X) \\
& + (X - g^{-1})(A(gX) - A(X) - F(X)G(X)) \\
& + L_{|H|}(X)(A(X) - s)
\end{aligned}$$

This is done by showing that $C$ is divisible by $Z_H$. So $P$ computes the quotient polynomial $Q = C/Z_H$.

3. P sends $[Q]$.
4. $V$ sends random evaluation challenge $r \in \mathbb{F}$.
5. $P$ sends $A(gr), A(r), G(r), Q(r)$ with opening proofs.
6. $V$ computes $F(r)$, $L_1(r)$, $L_{|H|}(r)$, and $Z_H(r)$, then checks:

$$\begin{aligned}
Z_H(r) \cdot Q(r) =\; & L_1(r) A(r) \\
& + (r - g^{-1})(A(gr) - A(r) - F(r)G(r)) \\
& + L_{|H|}(r)(A(r) - s)
\end{aligned}$$


### zk simulator:

The main point is the simulator doesn't need $u$
The transcript consists of
$cm(G),cm(A),cm(T),\alpha,A(\alpha),G(\alpha),F(\alpha),A(\omega \alpha),T(\alpha)$


The simulator has access to the srs secret $\tau$.
It chooses all transcript values besides $cm(T)=T(\tau)$ and $T(\alpha)$ randomly and independently.
And then deterministically computes these two values to satisfy the quotient equation (as written in step 7 for $\alpha$) at $\tau,\alpha$ respectively.


