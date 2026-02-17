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

### ZK-Sumcheck
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

### ECCVM Translation Data Consistency

In ECCVM, the prover must link the transcript wires (`op`, `Px`, `Py`, `z1`, `z2`) to the accumulator computed by the translator. Let $T_0, \ldots, T_4$ denote these 5 **translation polynomials**. The verifier checks:
$$x \cdot A = \sum_{i=0}^{4} T_i(x) \cdot v^i$$
where $A$ is the accumulated result and $x$, $v$ are challenges.

**The ZK Challenge:** The translation polynomials are masked to preserve zero-knowledge:
$$\widetilde{T}_i(X) = T_i(X) + X^N \cdot m_i(X)$$
where $N = \text{circuit\_size} - M$ and $M = \text{NUM\_DISABLED\_ROWS\_IN\_SUMCHECK}$.

The verifier cannot receive unmasked evaluations $T_i(x)$. With masking, the identity becomes:
$$x \cdot A = \sum_{i=0}^{4} \widetilde{T}_i(x) \cdot v^i - x^N \cdot \sum_{i=0}^{4} m_i(x) \cdot v^i$$

**The Solution:** The prover sends $\widetilde{T}_i(x)$ (safe to reveal) and proves the correction term $\sum_i m_i(x) v^i$ via SmallSubgroupIPA:

- **$G$** = polynomial whose Lagrange coefficients over $H$ are the concatenation $(m_0 \| m_1 \| m_2 \| m_3 \| m_4 \| \vec{0})$, where each $m_i$ is a vector of $M$ coefficients
- **$F$** = challenge polynomial with Lagrange coefficients:
  $$(1, x, x^2, \ldots, x^{M-1}, v, vx, \ldots, vx^{M-1}, \ldots, v^4, v^4 x, \ldots, v^4 x^{M-1}, 0, \ldots)$$

The inner product computes:
$$\langle F, G \rangle = \sum_{i=0}^{4} v^i \cdot m_i(x) = \sum_{i=0}^{4} v^i \sum_{j=0}^{M-1} m_{i,j} x^j$$

This allows the verifier to compute the correction term without learning the unmasked wire evaluations.

### Why This Approach?

There is no direct way of comitting to $H$ unless a multivariate polynomial commitment scheme is used. This would not allow us to batch the opennings of this commitment with the rest of the commitments required in the protocol.

We could convert each univariate component to a multilinear polynomial of $\log(\textsf{deg}(H_i))$ variables (with similar tricks as in Gemini) and have $\log(d)$ variables to concatinate them together and use Gemini for the opennings.

This is quite wasteful as we are not benefiting from the $\textsf{deg}(H_i)$'s being smooth.

Instead we:
1. Commit to the concatenated polynomial $G$ (small: size $\approx d \cdot L$ where $L$ = `LIBRA_UNIVARIATES_LENGTH`)
2. Prove $\langle F, G \rangle = s$ using SmallSubgroupIPA (leverages small multiplicative subgroup)

This will lead to a linear time verifier. But since $L$ is small, this is not an issue.

## Protocol Description

Now we dscribe a zero-knowledge inner products protocol using KZG with linear time verifier.

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
6. $V$ computes $F(r)$, $L_1(r)$, $L_{|H|}(r)$, and $Z_H(r)$ (This is where the linear complexity of the verifier comes from), then checks:

$$\begin{aligned}
Z_H(r) \cdot Q(r) =\; & L_1(r) A(r) \\
& + (r - g^{-1})(A(gr) - A(r) - F(r)G(r)) \\
& + L_{|H|}(r)(A(r) - s)
\end{aligned}$$

### Implementation:
Similar to Gemini, in small subgroup IPA, the verifier checks the correctness of the algebraic identity provided above for the claimed evaluations.
The correctness of the openning claims and commitments (the concatination $G$, the grand-sum polynomial $A$ and the quotient $Q$) are deffered to Shplemini, where adds them to the containers for computing the final MSM.


### zk simulator sketch:

The main point is the simulator doesn't need $u$
The transcript consists of
$cm(G),cm(A),cm(T),\alpha,A(\alpha),G(\alpha),F(\alpha),A(\omega \alpha),T(\alpha)$


The simulator has access to the srs secret $\tau$.
It chooses all transcript values besides $cm(T)=T(\tau)$ and $T(\alpha)$ randomly and independently.
And then deterministically computes these two values to satisfy the quotient equation (as written in step 7 for $\alpha$) at $\tau,\alpha$ respectively.


