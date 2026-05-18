# Shplemini ZK — Target Filtration Guess

The previous note replaced $D_t$ with $T_t = D_t + M_t$, which undoes the
Gemini structure (the $D_t$ row is precisely $T_t - M_t$, designed so that
the level-$t$ Gemini-fold update $A_{t-1}^\pm$ appears in the formula).
The affine residuals $A_k^-(\tau) = u_k - (1-u_k)\tau$ and
$A_k^+(r_k) = u_k + (1-u_k)r_k$ cannot appear unless the
$(D,M)$ asymmetry is preserved. So instead of touching the rows, **guess
the filtration on the target $W$** directly from the formula.

## Setup

Target coordinates: $W$ has basis $(e_0^D, e_0^M, e_1^D, e_1^M, \ldots,
e_{d-1}^D, e_{d-1}^M)$, indexed by rows of $B$. The source is
$V_S = V_{\mathrm{dyad}} \oplus P_{\mathrm{top}}$ with
$V_{\mathrm{dyad}} = \bigoplus_{k=1}^{d-1} P_k$,
$P_k = \mathrm{span}\{E_{2^k}, E_{2^k-1}\}$.

The conjectured factorisation reads (regrouping the formula):

$$
\det B_d
= (-1)^d\cdot \underbrace{r_0^2\tau^2\bigl(\tau^{E-4}-r_0^{E-4}\bigr)}_{\mathsf{Top}}
\cdot \prod_{k=1}^{d-2}\underbrace{(\tau^2-r_k^2)L_0(u_{<k})L_{2^k-1}(u_{<k})A_{k-1}^{+}(r_{k-1})A_{k-1}^{-}(\tau)}_{\mathsf{Mid}_k}
\cdot \underbrace{(\tau+r_{d-1})A_{d-2}^{+}(r_{d-2})A_{d-2}^{-}(\tau)}_{\mathsf{Last}}.
$$

(Reallocated relative to the small-cases note: $A_{k-1}^{\pm}$ is moved
into the $\mathsf{Mid}_k$ block so that the **source pair index $k$**
controls *all* factors that depend on $r_k$ or that come from the
Gemini-fold update at level $k-1\to k$. The $\mathsf{Top}$ block then
holds only $r_0$/$\tau$ residuals and the $(E-4)$-anomaly.)

This shape — exactly $d$ blocks, one per source pair, with each block
factoring over $(r_k,\tau,u_{<k},u_{k-1})$ — is the signature of a
filtration of $W$ by $d$ two-dimensional quotients, peeled from
innermost ($\mathsf{Last}$) to outermost ($\mathsf{Top}$).

## Filtration of $W$

Define a flag

$$
0 \;=\; W^{(d)} \;\subset\; W^{(d-1)} \;\subset\;\cdots\;\subset\; W^{(1)} \;\subset\; W^{(0)} \;=\; W,
\qquad \dim W^{(k)}/W^{(k+1)} \;=\; 2,
$$

so that $\Psi$ is filtered: $\Psi(P_k) \subset W^{(k)}$, with
$\Psi(P_{\mathrm{top}}) \subset W^{(0)} = W$ but
$\Psi(P_{\mathrm{top}}) \not\subset W^{(1)}$, and similarly for each
level. The determinant factorises along the associated graded:

$$
\det B_d \;=\; \prod_{k=0}^{d-1}\det \overline{\Psi}_k,
\qquad
\overline{\Psi}_k : P_{k} \longrightarrow W^{(k)}/W^{(k+1)} ,
$$

with the convention $P_0 := P_{\mathrm{top}}$.

The guess is the following explicit choice of $W^{(k)}$, read off the
formula:

### Innermost: $W^{(d-1)}$ (the $\mathsf{Last}$ slot)

$W^{(d-1)} = \mathrm{span}(\,e_{d-1}^D,\, e_{d-1}^M\,)$ — the two rows
of level $d-1$. The restriction $\Psi|_{P_{d-1}}\to W^{(d-1)}$ is the
diagonal $2\times 2$ minor

$$
\begin{pmatrix}
L_0(u_{<d-1})(\tau+r_{d-1}) & 0 \\
L_0(u_{<d-1})(-r_{d-1}) & L_{2^{d-1}-1}(u_{<d-1})
\end{pmatrix}
$$

with determinant $L_0(u_{<d-1})\,L_{2^{d-1}-1}(u_{<d-1})\,(\tau+r_{d-1})$.

The $\mathsf{Last}$ block expects only $\tau+r_{d-1}$ (no Lagrange), so
the Lagrange prefactor $L_0(u_{<d-1})L_{2^{d-1}-1}(u_{<d-1})$ must be
**cancelled by a denominator in the affine residual block
$A_{d-2}^{\pm}$**. This is consistent: $A_{d-2}^{\pm}$ depends on
$u_{d-2}$, the next-level Gemini variable, and its product is
proportional to $L_0(u_{<d-1})L_{2^{d-1}-1}(u_{<d-1})$ on the locus
where the fold collapses. The clean way to record this is

$$
\overline{\Psi}_{d-1} \;=\; (\tau+r_{d-1})\;\cdot\;A_{d-2}^{+}(r_{d-2})A_{d-2}^{-}(\tau)\,/\,\text{(Lagrange residue)} ,
$$

i.e. $\mathsf{Last} = (\tau+r_{d-1})A_{d-2}^{+}(r_{d-2})A_{d-2}^{-}(\tau)$
after the Schur clean-up from the next step pulls the Lagrange into
$\mathsf{Mid}_{d-2}$ where it belongs.

### Middle: $W^{(k)}/W^{(k+1)}$ for $1\le k\le d-2$ (the $\mathsf{Mid}_k$ slot)

Conjecturally,

$$
W^{(k)}/W^{(k+1)} \;=\; \mathrm{span}\bigl(\,e_k^D + (\text{Schur tail to higher levels}),\; e_k^M + (\text{Schur tail})\,\bigr) .
$$

The Schur tail involves $u_{k}$ via the Gemini-fold update connecting
level $k$ to level $k+1$, which is exactly where the
$A_{k-1}^{+}(r_{k-1})\,A_{k-1}^{-}(\tau)$ factor enters (the index
shift $k\to k-1$ is the "previous" Gemini step seen from level $k$).
The level-$k$ Vandermonde $(\tau^2-r_k^2)$ comes from the *symmetric*
combination $\tau\to -r_k$ over the two ways the pair $P_k$ can hit
the two basis vectors $e_k^D, e_k^M$ after Schur correction (one
contributes $\tau+r_k$ from the diagonal minor; the other contributes
$\tau-r_k$ from the off-diagonal Schur term).

### Outermost: $W^{(0)}/W^{(1)}$ (the $\mathsf{Top}$ slot)

$W^{(0)}/W^{(1)}$ is the 2D quotient holding $(e_0^D, e_0^M)$ — the two
rows of level $0$ — *after* the dyadic image has been quotiented out.
The induced map $\overline{\Psi}_0 : P_{\mathrm{top}}\to W^{(0)}/W^{(1)}$
is exactly the top-pair Schur complement, and its determinant is

$$
\det\overline{\Psi}_0 \;=\; r_0^2\,\tau^2\,\bigl(\tau^{E-4}-r_0^{E-4}\bigr).
$$

This is the *only* slot where the anomalous $E-4$ exponent appears.
Note that $A_0^{\pm}$ is **not** here — it lives in $\mathsf{Mid}_1$
(it is the Gemini update connecting level $0$ to level $1$, and that
interaction is recorded by the source pair $P_1$, not $P_{\mathrm{top}}$).

## Reading the filtration as a sequence of moves

The filtration above is equivalent to the following peeling procedure:

1. **Peel $W^{(d-1)}$**: the bottom two rows $(D_{d-1}, M_{d-1})$. The
   pair $P_{d-1}$ maps into these rows on its diagonal block, and the
   $\tau+r_{d-1}$ factor comes from the explicit $2\times 2$ minor.
   Move the Lagrange factor $L_0(u_{<d-1})L_{2^{d-1}-1}(u_{<d-1})$
   into the *next* peeling step as the Schur tail.

2. **Peel $W^{(k)}/W^{(k+1)}$ for $k=d-2,d-3,\ldots,1$**: rows
   $(D_k, M_k)$ after subtracting the Schur tails coming from peeled
   levels $> k$. The $2\times 2$ block determinant on $P_k$ is

   $$
   (\tau^2-r_k^2)\,L_0(u_{<k})L_{2^k-1}(u_{<k})\,A_{k-1}^{+}(r_{k-1})A_{k-1}^{-}(\tau).
   $$

   The factor $(\tau^2-r_k^2)$ arises as $(\tau+r_k)(\tau-r_k)$, where:
   - $\tau+r_k$ is the diagonal $2\times 2$ minor of $(D_k, M_k)$ on $P_k$
     (same shape as the level-$(d-1)$ step);
   - $\tau-r_k$ is the *off-diagonal Schur correction* coming from the
     image of $P_k$ in the already-peeled $W^{(k+1)}, \ldots, W^{(d-1)}$
     direction (this is where the $D_t = T_t - M_t$ asymmetry pays off:
     the Schur correction sees $-r_k$ vs $\tau$, not $\tau$ vs $\tau$).

   The Lagrange factor $L_0(u_{<k})L_{2^k-1}(u_{<k})$ is the diagonal
   $\ell_k$ contribution, and the affine $A_{k-1}^{\pm}$ comes from
   the Gemini-fold relation linking $\ell_k$ to $\ell_{k-1}$ in the
   off-diagonal Schur term.

3. **Peel $W^{(0)}/W^{(1)}$**: the top pair $P_{\mathrm{top}}$ after all
   dyadic Schur tails are eliminated. The residual $2\times 2$
   determinant is $r_0^2\tau^2(\tau^{E-4}-r_0^{E-4})$.

   In the Schur complement, the dyadic image projects out monomials of
   degree $\le N/2$ from the level-$0$ rows, leaving the residual
   alternant on the top pair $\{E-1, E-2\}$ of degree $E-4$.

## What this changes vs. the row-block approach

| object | row-block (previous) | target-filtration (this note) |
|---|---|---|
| basis at level $k$ | $(T_k, M_k)$ — Gemini killed | $(D_k, M_k)$ — Gemini preserved |
| where $A_k^{\pm}$ comes from | per-level sum over pair orientations | Schur correction across levels $k\to k+1$ |
| where $\tau^{E-4}-r_0^{E-4}$ lives | column-transform Jacobian $\det U$ | top-pair Schur complement on $W^{(0)}/W^{(1)}$ |
| degree of anomaly | global, mixes levels | localised to a single 2D residue |
| treatment of $(D,M)$ asymmetry | erased | preserved |

The target-filtration view is the right one because it keeps the
$(D,M)$ structure and lets the Gemini update polynomial
$A_k^{\pm}$ enter where it actually does — as the off-diagonal Schur
correction connecting consecutive fold levels.

## What still needs to be written

To turn the guess into a proof:

1. **Write $W^{(k)}$ explicitly.** A natural candidate is

   $$
   W^{(k)} \;=\; \Psi\bigl(\mathrm{span}(P_{k}, P_{k+1}, \ldots, P_{d-1})\bigr)
   $$

   — the image of the dyadic tail below level $k$. With this definition
   the filtration is automatic; the work is to compute the quotient
   bases and check the $2\times 2$ block determinants match
   $\mathsf{Last}, \mathsf{Mid}_k, \mathsf{Top}$.

2. **Compute one Schur correction.** The level-$k$ off-diagonal Schur
   term is a product of an entry of $(D_k, M_k)$ outside $P_k$ with the
   inverse of the already-peeled block. Show by direct computation that
   it equals
   $(\tau-r_k)\cdot A_{k-1}^{+}(r_{k-1})\,A_{k-1}^{-}(\tau)/L_0L_{2^k-1}$
   up to the Lagrange residue. This is the *one* non-trivial identity in
   the whole proof.

3. **Compute the top-pair Schur determinant.** The hardest individual
   computation: project $P_{\mathrm{top}}$ onto $W/W^{(1)}$ and verify
   the result is $r_0^2\tau^2(\tau^{E-4}-r_0^{E-4})$. The $E-4$
   exponent should fall out as $(E-1)-(E-2)-1 = -2$ shifted by the
   degree of the dyadic monomials being subtracted, but this needs the
   explicit Schur computation.

Step 2 closes $d-1$ slots at once because the level-$k$ Schur correction
has the same shape for all $k\in\{1,\ldots,d-2\}$ — it's a single local
identity, not a per-$k$ verification. Step 3 isolates the genuinely new
phenomenon (the $E-4$ exponent) to a single, fully concrete $2\times 2$
computation.
