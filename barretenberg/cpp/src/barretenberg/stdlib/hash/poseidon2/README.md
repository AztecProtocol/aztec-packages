# stdlib Poseidon2 Hash Implementation

Poseidon2 is a **SNARK-friendly cryptographic hash** designed to be efficient inside prime-field arithmetic circuits.
It follows the [Poseidon2 paper](https://eprint.iacr.org/2023/323.pdf) and refines the original Poseidon hash.

This implementation includes:

- A **sponge construction** over the BN254 scalar field following the (draft) C2SP Poseidon Sponge spec based on the [Duplex Sponge model](https://keccak.team/files/SpongeDuplex.pdf).
- The **Poseidon2 permutation**, i.e. the round function used by the sponge.
- **Circuit custom gate relations** that enforce the permutation’s correctness.


## The Sponge Construction

The sponge absorbs input elements into an internal state, applies permutations, and squeezes
output elements.

| Parameter | Value |
|-----------|-------|
| State size | $t = 4$ field elements |
| Rate | $r = 3$ field elements |
| Capacity | $c = 1$ field element |
| Domain separator | $\mathrm{IV} = \texttt{input\_length}^{64}$ |

Let the input be:

$$
\mathbf{a} = (a_0, a_1, \ldots, a_{N-1})
$$

Partition it into rate-sized blocks:

$$
B_j = (a_{3j}, a_{3j+1}, a_{3j+2}), \qquad
m = \left\lceil \frac{N}{3}\right\rceil
$$

Missing entries in the final block are padded with $0$. This is safe for the variable-length
sponge because the input length is part of the domain separator. The initial state is:

$$
\mathbf{s}^{(0)} = (0, 0, 0, \mathrm{IV})
$$

For each block $j = 0, \ldots, m - 1$:

$$
\mathbf{s}^{(j+1)} = P\left(\mathbf{s}^{(j)} + (B_j, 0)\right)
$$

where $P$ is the Poseidon2 permutation. The single-output squeeze is:

$$
y_0 = \left(P(\mathbf{s}^{(m)})\right)_0
$$

The IV is created as a fixed witness so the first permutation starts from normalized stdlib
field values.

## The Poseidon2 Permutation

The mathematical permutation is identical in Ultra and Mega. The difference is only how the
permutation is encoded in the trace.

```text
input state
    |
    v
initial external linear layer M_E
    |
    v
4 external rounds  : full S-box on all 4 limbs, then M_E
    |
    v
56 internal rounds : S-box only on state[0], then M_I
    |
    v
4 external rounds  : full S-box on all 4 limbs, then M_E
    |
    v
output state
```

External matrix:

```text
M_E = [ 5 7 1 3 ]
      [ 4 6 1 1 ]
      [ 1 3 5 7 ]
      [ 1 1 4 6 ]
```

Internal matrix:

```text
M_I = [ D1 1  1  1  ]
      [ 1  D2 1  1  ]
      [ 1  1  D3 1  ]
      [ 1  1  1  D4 ]
```

The code stores `internal_matrix_diagonal_minus_one[i] = D_i - 1`, because multiplication is
implemented as `(D_i - 1) * x_i + sum(x)`.

The constants are generated from the Sage script authored by Markus Schofnegger in the Horizen
Labs Poseidon2 parameter tooling. With `R_P = 56`, `R_F = 8`, `d = 5`, and a 254-bit scalar
field, the parameter set targets 128-bit security.

## Trace Layouts

Ultra uses the direct layout: one row per internal round, and six arithmetic rows for the
initial external linear layer.

```text
Ultra permutation rows

6  arithmetic rows                 initial M_E
4  poseidon2_external rows          first external rounds
1  poseidon2_external propagate
56 poseidon2_internal rows          one partial round each
1  poseidon2_internal propagate
4  poseidon2_external rows          final external rounds
1  poseidon2_external propagate
--
73 rows
```

Mega keeps the same permutation but uses custom rows for the initial external linear layer and
compresses all 56 internal rounds into K=4 rows.

```text
Mega permutation rows

1      poseidon2_external           q_poseidon2_external_initial
4 + 1  poseidon2_external           first external rounds + propagate
1      poseidon2_quad_internal      q_poseidon2_transition_entry
13     poseidon2_quad_internal      q_poseidon2_quad_internal
1      poseidon2_quad_internal      q_poseidon2_quad_internal_terminal
1      poseidon2_quad_internal      unconstrained standard bridge
4 + 1  poseidon2_external           final external rounds + propagate
--
27 rows
```

The stdlib hash also has one fixed-witness IV row outside the permutation when it starts from
the sponge IV.

## Mega K=4 Internal Compression

Poseidon2 internal rounds are special because only `state[0]` passes through an S-box. The other
three limbs evolve linearly. Mega exploits this by committing four consecutive `state[0]` values
per row instead of committing the full state for every internal round.

For a quad row that starts at internal round `4i`:

| Wire | Meaning |
|------|---------|
| `w_l` | `state[0]` at round `4i` |
| `w_r` | `state[0]` at round `4i + 1` |
| `w_o` | `state[0]` at round `4i + 2` |
| `w_4` | `state[0]` at round `4i + 3` |

The row selectors carry the current quad constants and, for interior rows, the next quad's first
three constants:

| Selector | Value |
|----------|-------|
| `q_l` | `c_{4i}` |
| `q_r` | `c_{4i+1}` |
| `q_o` | `c_{4i+2}` |
| `q_4` | `c_{4i+3}` |
| `q_m` | `c_{4(i+1)}` |
| `q_c` | `c_{4(i+1)+1}` |
| `q_5` | `c_{4(i+1)+2}` |

The compression picture is:

```text
standard state before internal rounds
    (s0, s1, s2, s3)
       |
       | q_poseidon2_transition_entry
       v
first quad row
    (s0^0, s0^1, s0^2, s0^3)
       |
       | 13 q_poseidon2_quad_internal rows
       v
terminal quad row
    (s0^52, s0^53, s0^54, s0^55)
       |
       | q_poseidon2_quad_internal_terminal
       v
standard bridge row
    (s0^56, s1^56, s2^56, s3^56)
       |
       v
final external rounds
```

## Algebra Inside A Quad Row

Let a quad row start from `(s0, s1, s2, s3)`, and let:

```text
u_k = (s0^(k) + c_{4i+k})^5
```

The first row of `M_I` gives:

```text
s0^(k+1) = D1 * u_k + s1^(k) + s2^(k) + s3^(k)
```

The lower three limbs are linear. Applying the recurrence three times gives a 3 by 3
Vandermonde system:

```text
[ 1    1    1   ] [s1]   [b1]
[ D2   D3   D4  ] [s2] = [b2]
[ D2^2 D3^2 D4^2] [s3]   [b3]
```

where:

```text
b1 = w_r - D1 * u_0
b2 = w_o - 2*w_r + (2*D1 - 3)*u_0 - D1*u_1
b3 = w_4 - w_o - (Sigma + 2)*w_r
     + ((Sigma + 2)*D1 - Sigma - 3)*u_0
     + (D1 - 3)*u_1 - D1*u_2
Sigma = D2 + D3 + D4
```

The determinant is:

```text
(D3 - D2) * (D4 - D2) * (D4 - D3)
```

`poseidon2_quad_params.hpp` has `static_assert`s that `D2`, `D3`, and `D4` are pairwise
distinct, so the system is invertible for the BN254 Poseidon2 parameters. The inverse
coefficients are fixed constants.

Degree stays bounded because each S-box is applied to a committed wire, not to an inlined
degree-5 expression. The Vandermonde solve is linear in those S-box outputs. Each subrelation
therefore has degree 5 before multiplying by its selector and gate separator, and partial
length 7 after those factors.

## Relations

### Initial External

`Poseidon2InitialExternalRelationImpl` constrains the Mega-only initial `M_E` multiplication in
one row under `q_poseidon2_external_initial`. Ultra uses six arithmetic rows for the same layer.

### External

`Poseidon2ExternalRelationImpl` constrains each full external round. The row holds the current
standard-encoded state. The relation applies full S-boxes, multiplies by `M_E`, and checks the
result against the shifted row.

### Entry

`Poseidon2TransitionEntryRelationImpl` bridges from standard encoding to quad encoding.

```text
entry row                 first quad row
(s0, s1, s2, s3)   --->   (s0^0, s0^1, s0^2, s0^3)
```

`s0^0` is copy-constrained to the entry row's `s0`. The relation has three subrelations that
force `s0^1`, `s0^2`, and `s0^3`. Each uses the previous shifted wire as a degree firewall.

### Interior Quad

`Poseidon2QuadInternalRelationImpl` is active on the 13 non-terminal quad rows.

```text
current quad row                       next quad row
(s0^k, s0^{k+1}, s0^{k+2}, s0^{k+3}) -> (s0^{k+4}, s0^{k+5}, s0^{k+6}, s0^{k+7})
```

The relation:

1. Reconstructs the current hidden limbs `(s1, s2, s3)` from the current row.
2. Applies four internal rounds.
3. Fixes the next row's `w_l = s0^{k+4}`.
4. Checks that the next row's hidden limbs implied by its own `state[0]` chain match the computed
   output hidden limbs, using the next constants in `q_m`, `q_c`, and `q_5`.

### Terminal Quad

`Poseidon2QuadInternalTerminalRelationImpl` is active on the final quad row. It computes the
last four internal rounds and pins the shifted standard bridge row:

```text
terminal quad row                  bridge row
(s0^52, s0^53, s0^54, s0^55) --->  (s0^56, s1^56, s2^56, s3^56)
```

The bridge row is unconstrained by its own selector, but its wire witnesses are constrained by
the terminal relation and then copy-constrained into the final external block.

## Soundness Argument

The proof obligation is: every accepting Mega trace describes the same 56 internal rounds as the
direct standard encoding.

```text
external output
   |
   | entry relation + copy constraint
   v
quad row 0
   |
   | one-step lemma
   v
quad row 1
   |
   | repeated for rows 1..12
   v
quad row 13
   |
   | terminal relation + copy constraint
   v
final external input
```

The one-step lemma for an interior row is:

1. The row's four `state[0]` values uniquely determine the hidden starting limbs because the
   Vandermonde matrix is invertible.
2. Four Poseidon2 internal rounds are deterministic once the full starting state is known.
3. The first subrelation fixes the next row's first wire.
4. The remaining subrelations force the next row's hidden limbs, equivalently forcing the next
   row's remaining `state[0]` chain to be consistent with the computed output.

The boundary cases close the induction:

| Boundary | Why the prover has no freedom |
|----------|-------------------------------|
| External -> entry | Standard state wires are copy-constrained from the external propagate row. |
| Entry -> first quad | Entry relation fixes `s0^1`, `s0^2`, `s0^3`; `s0^0` is copied. |
| Interior -> interior | One-step lemma uniquely determines the successor row. |
| Terminal -> bridge | Terminal relation pins all four bridge wires. |
| Bridge -> final external | Bridge witnesses are copy-constrained into the final external rows. |

Thus every fresh witness in the compressed internal block is tied to a deterministic function of
the previous state. There is no free hidden `state[1..3]` channel left for the prover.

## Witness Materialization

The relation derives `state[1..3]` from the committed `state[0]` chain, so the stdlib only
materializes hidden limbs when they are needed by the terminal bridge.

```text
non-terminal quad output: create witness for next state[0] only
terminal quad output:     create witnesses for state[0], state[1], state[2], state[3]
```

This saves 39 witness variables per permutation: 13 non-terminal quad rows times 3 hidden limbs.

## Selector And File Map

Mega removes `q_poseidon2_internal` and adds the following Poseidon2-specific selectors:

| Selector | Purpose |
|----------|---------|
| `q_poseidon2_external_initial` | Initial external linear layer |
| `q_poseidon2_transition_entry` | Standard-to-quad boundary |
| `q_poseidon2_quad_internal` | Interior K=4 rows |
| `q_poseidon2_quad_internal_terminal` | Quad-to-standard terminal boundary |
| `q_5` | Non-gate selector for the next quad's third round constant |

Implementation entry points:

| File | Purpose |
|------|---------|
| `poseidon2_permutation.cpp` | stdlib permutation trace emission |
| `relations/poseidon2_initial_external_relation.hpp` | Mega initial linear layer relation |
| `relations/poseidon2_external_relation.hpp` | External round relation |
| `relations/poseidon2_transition_entry_relation.hpp` | Entry boundary relation |
| `relations/poseidon2_quad_internal_relation.hpp` | Interior quad relation |
| `relations/poseidon2_quad_internal_terminal_relation.hpp` | Terminal boundary relation |
| `crypto/poseidon2/poseidon2_quad_params.hpp` | Vandermonde constants and static checks |
| `honk/execution_trace/mega_execution_trace.hpp` | Mega trace blocks and selector partitioning |
| `flavor/mega_flavor.hpp` | Mega relation and selector set |

Historical performance notes live at the repository root in `poseidon2-compression-analysis.md`.
