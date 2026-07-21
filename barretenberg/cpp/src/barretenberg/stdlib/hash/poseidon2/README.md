# Stdlib Poseidon2 Hash Implementation

Poseidon2 is a **SNARK-friendly cryptographic hash** designed to be efficient inside prime-field arithmetic circuits.
It follows the [Poseidon2 paper](https://eprint.iacr.org/2023/323.pdf) and refines the original Poseidon hash.

This implementation includes:

- A **sponge construction** over the BN254 scalar field following the (draft) C2SP Poseidon Sponge spec based on the [Duplex Sponge model](https://keccak.team/files/SpongeDuplex.pdf).
- The **Poseidon2 permutation**, i.e. the round function used by the sponge.
- **Circuit custom gate relations** that enforce the permutation’s correctness.

## Contents

- [The Sponge Construction](#the-sponge-construction)
- [The Poseidon2 Permutation](#the-poseidon2-permutation)
- [Trace Layouts](#trace-layouts)
- [Initial External Linear Layer](#initial-external-linear-layer)
- [External Round Subrelations](#external-round-subrelations)
- [Mega Internal Compression](#mega-internal-compression)
- [Compressed Block Subrelations](#compressed-block-subrelations)
- [Soundness Argument](#soundness-argument)
- [Witness Materialization](#witness-materialization)
- [Selectors and File Map](#selectors-and-file-map)

## The Sponge Construction

The sponge absorbs input elements into an internal state, applies permutations, and squeezes
output elements.

| Parameter | Value |
|-----------|-------|
| State size | $t = 4$ field elements |
| Rate | $r = 3$ field elements |
| Capacity | $c = 1$ field element |
| Domain separator | $\mathrm{IV} = \texttt{input\_length} \ll 64$ |

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
4 external rounds  : full S-box on all 4 state entries, then M_E
    |
    v
56 internal rounds : S-box only on state[0], then M_I
    |
    v
4 external rounds  : full S-box on all 4 state entries, then M_E
    |
    v
output state
```

External matrix:

$$
M_E =
\begin{bmatrix}
5 & 7 & 1 & 3 \\
4 & 6 & 1 & 1 \\
1 & 3 & 5 & 7 \\
1 & 1 & 4 & 6
\end{bmatrix}
$$

Internal matrix, written with the actual diagonal entries $D_i$:

$$
M_I =
\begin{bmatrix}
D_1 & 1 & 1 & 1 \\
1 & D_2 & 1 & 1 \\
1 & 1 & D_3 & 1 \\
1 & 1 & 1 & D_4
\end{bmatrix}
$$

The parameter table stores `internal_matrix_diagonal_minus_one[i] = D_i - 1`, not $D_i$
itself. This lets the implementation compute the internal matrix product as
`(D_i - 1) * x_i + sum(x)`, which is equal to $D_i x_i + \sum_{j \ne i} x_j$.

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
compresses all 56 internal rounds into K=4 rows. All five gate kinds share the single `poseidon2`
block, so each permutation's rows are contiguous: the external and terminal round relations
constrain their successor row's wires via `w_shift`, so each round's output lands on the next row
directly across the external↔internal boundary.

```text
Mega permutation rows (all in the `poseidon2` block)

1      q_poseidon2_external_initial
4      first external rounds
1      q_poseidon2_transition_entry
13     q_poseidon2_quad_internal
1      q_poseidon2_quad_internal_terminal
4 + 1  final external rounds + output row
--
25 rows
```

The trailing selector-unconstrained row holds the permutation output: the last external round's
relation pins its wires via `w_shift`. See the [Soundness Argument](#soundness-argument) section
for the boundary-handoff argument.

The stdlib hash also has one fixed-witness IV row outside the permutation when it starts from
the sponge IV.

## Initial External Linear Layer

The initial external linear layer has no S-boxes. Mega constrains it in one row under
`q_poseidon2_external_initial`, while Ultra emits arithmetic rows for the same matrix product.
Given:

$$
\mathbf{x} =
\begin{bmatrix}
w_l \\
w_r \\
w_o \\
w_4
\end{bmatrix},
\qquad
\mathbf{y} =
M_E\mathbf{x},
$$

the four subrelations constrain the shifted row:

$$
\begin{aligned}
A_0 &: y_0 - w_l' = 0, \\
A_1 &: y_1 - w_r' = 0, \\
A_2 &: y_2 - w_o' = 0, \\
A_3 &: y_3 - w_4' = 0.
\end{aligned}
$$

## External Round Subrelations

An external round starts from a standard-encoded row:

$$
(w_l, w_r, w_o, w_4)
$$

with round constants in `(q_l, q_r, q_o, q_4)`. The relation computes:

$$
\begin{aligned}
u_1 &= (w_l + q_l)^5, \\
u_2 &= (w_r + q_r)^5, \\
u_3 &= (w_o + q_o)^5, \\
u_4 &= (w_4 + q_4)^5,
\end{aligned}
$$

then applies the external matrix:

$$
\begin{bmatrix} v_1 \\ v_2 \\ v_3 \\ v_4 \end{bmatrix} = M_E \begin{bmatrix} u_1 \\ u_2 \\ u_3 \\ u_4 \end{bmatrix}.
$$

The four external subrelations constrain the result against the shifted row:

$$
\begin{aligned}
A_0 &: v_1 - w_l' = 0, \\
A_1 &: v_2 - w_r' = 0, \\
A_2 &: v_3 - w_o' = 0, \\
A_3 &: v_4 - w_4' = 0.
\end{aligned}
$$

## Mega Internal Compression

Mega uses a K=4 layout: each compressed row commits four consecutive `state[0]` values instead of the full state at every internal round. This is sound because only `state[0]` passes through the internal-round S-box. Once the four S-box outputs are fixed, the update of `state[1..3]` is linear and can be checked through an invertible 3 by 3 linear encoding.

For a self-contained linear-algebra statement of the underlying soundness theorem — abstracted away from Poseidon2-specific notation, with a proof and a discussion of which other matrices the same construction would work for — see [QUAD_THEOREM.md](QUAD_THEOREM.md).

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
       | q_poseidon2_quad_internal_terminal (w_shift binds the next row)
       v
first final-external row
    (s0^56, s1^56, s2^56, s3^56)
       |
       v
remaining final external rounds
```

The terminal relation's `w_shift` lands directly on the first final-external row (the rows are
contiguous in the `poseidon2` block), so the full standard state at round 56 is exactly that
external round's input.

## Compressed Block Subrelations

Every subrelation in the compressed block enforces the Poseidon2 internal-round recurrence in the encoding appropriate for its boundary:

| Boundary | What's known | What the subrelations enforce |
|---|---|---|
| **Entry** | full standard state at row-start | first three `state[0]` values of the first compressed row |
| **Interior** | `state[0]` chain on this row and the next | four-round output, with the next row's `state[1..3]` checked through the same linear encoding |
| **Terminal** | `state[0]` chain on this row, full standard state on the next (first final-external) row | four-round output matched directly against that row |

The interior and terminal boundaries share a four-round closed form that we cover first.

### Closed Form for Four Rounds

Write the committed quad-row wires as:

$$
(w_l, w_r, w_o, w_4) = (s_0^{(0)}, s_0^{(1)}, s_0^{(2)}, s_0^{(3)})
$$

and define the four S-box outputs:

$$
u_k = (s_0^{(k)} + c_{4i+k})^5, \qquad k \in \{0, 1, 2, 3\}.
$$

The row does not store `state[1..3]`. Instead, the claimed successor values
$w_r = s_0^{(1)}$, $w_o = s_0^{(2)}$, and $w_4 = s_0^{(3)}$ determine three linear
combinations of the hidden start-of-row values
$(s_1^{(0)}, s_2^{(0)}, s_3^{(0)})$. For this reconstruction, use Vandermonde nodes
$\lambda_1 = D_2$, $\lambda_2 = D_3$, and $\lambda_3 = D_4$:

$$
\begin{bmatrix} 1 & 1 & 1 \\ \lambda_1 & \lambda_2 & \lambda_3 \\ \lambda_1^2 & \lambda_2^2 & \lambda_3^2 \end{bmatrix} \begin{bmatrix} s_1^{(0)} \\ s_2^{(0)} \\ s_3^{(0)} \end{bmatrix} = \begin{bmatrix} b_1 \\ b_2 \\ b_3 \end{bmatrix}.
$$

Solving the internal-round recurrence gives the right-hand sides:

$$
\begin{aligned}
b_1 &= w_r - D_1 u_0, \\
b_2 &= w_o - 2w_r + (2D_1 - 3)u_0 - D_1u_1, \\
b_3 &= w_4 - w_o - (\Sigma + 2)w_r \\
    &\quad + ((\Sigma + 2)D_1 - \Sigma - 3)u_0
       + (D_1 - 3)u_1 - D_1u_2, \\
\Sigma &= D_2 + D_3 + D_4.
\end{aligned}
$$

The Vandermonde determinant is:

$$
(\lambda_2 - \lambda_1)(\lambda_3 - \lambda_1)(\lambda_3 - \lambda_2).
$$

`poseidon2_quad_params.hpp` has `static_assert`s that the three nodes are pairwise distinct,
so the hidden start-of-row `state[1..3]` values are uniquely determined by the committed
`state[0]` chain.

After this reconstruction, iterating four internal rounds expresses the row-end state as a
fixed linear combination of $(w_r, w_o, w_4, u_0, u_1, u_2, u_3)$:

$$
\operatorname{out} =
C \cdot
\begin{bmatrix}
w_r \\
w_o \\
w_4 \\
u_0 \\
u_1 \\
u_2 \\
u_3
\end{bmatrix},
\qquad
\operatorname{out} =
(\operatorname{out}_0, \operatorname{out}_1, \operatorname{out}_2, \operatorname{out}_3)
= (s_0^{(4)}, s_1^{(4)}, s_2^{(4)}, s_3^{(4)}).
$$

The coefficients of $C$ are precomputed in `poseidon2_quad_params.hpp` and unit-tested against
explicit four-step iteration in `poseidon2_quad_closed_form.test.cpp`.

`w_l` does not appear in the input vector because it enters only through $u_0 = (w_l + c_{4i})^5$.

Thus `out` is the predicted Poseidon2 state after the four internal rounds represented by this
quad row. The boundary subrelations check this predicted state against the successor row. For a
terminal row, the successor exposes all four output state entries directly. For an interior row,
the successor again exposes only its `state[0]` chain, so the relation compares `out_0`
directly and compares `out_1..out_3` through the same Vandermonde encoding.

### Entry: Standard to First Quad Row

The entry row holds $(s_0^{(0)}, s_1^{(0)}, s_2^{(0)}, s_3^{(0)})$ in standard encoding; the
first compressed row encodes $s_0$ at rounds $0, 1, 2, 3$ as $(w_l', w_r', w_o', w_4')$. The
entry row's `w_l` and the first compressed row's `w_l'` share a witness index, so the
permutation argument enforces that both occurrences carry $s_0^{(0)}$.

The three subrelations enforce the `state[0]` recurrence at $k = 0, 1, 2$. Because
`state[1..3]` are committed on the standard entry row, this boundary does not need a
Vandermonde reconstruction. With $u_0 = (s_0^{(0)} + c_0)^5$,
$u_1 = (w_r' + c_1)^5$, $u_2 = (w_o' + c_2)^5$, and $\Sigma = D_2 + D_3 + D_4$:

$$
\begin{aligned}
\operatorname{entry}_1 &= D_1 u_0 + s_1^{(0)} + s_2^{(0)} + s_3^{(0)}, \\
\operatorname{entry}_2 &= D_1 u_1 + 3 u_0
    + (D_2 + 2) s_1^{(0)} + (D_3 + 2) s_2^{(0)} + (D_4 + 2) s_3^{(0)}, \\
\operatorname{entry}_3 &= D_1 u_2 + 3 u_1 + (\Sigma + 6) u_0 \\
    &\quad + (D_2^2 + D_2 + \Sigma + 4) s_1^{(0)}
        + (D_3^2 + D_3 + \Sigma + 4) s_2^{(0)}
        + (D_4^2 + D_4 + \Sigma + 4) s_3^{(0)}.
\end{aligned}
$$

The entry subrelations are:

$$
\begin{aligned}
A_0 &: \operatorname{entry}_1 - w_r' = 0, \\
A_1 &: \operatorname{entry}_2 - w_o' = 0, \\
A_2 &: \operatorname{entry}_3 - w_4' = 0.
\end{aligned}
$$

Each later S-box ($u_1, u_2$) consumes an already-committed compressed-row wire instead of
inlining the previous round's S-box, keeping per-variable degree at 5.

This boundary has no hidden degrees of freedom: after the shared witness index fixes $w_l'$,
the three equations above form a triangular system in the remaining first-compressed-row
variables $(w_r', w_o', w_4')$. `A_0` fixes $w_r'$. Then `A_1` uses that fixed $w_r'$ in
$u_1 = (w_r' + c_1)^5$ and fixes $w_o'$. Then `A_2` uses that fixed $w_o'$ in
$u_2 = (w_o' + c_2)^5$ and fixes $w_4'$. Each subrelation has coefficient $-1$ on the next
wire it solves for, so the first compressed row is uniquely determined by the standard entry
state and the fixed round constants.

### Terminal: Final Quad Row to First Final-External Row

The terminal row's successor is the first final-external round's row, which carries the full
standard state $(s_0^{(4)}, s_1^{(4)}, s_2^{(4)}, s_3^{(4)})$. The four subrelations match the
closed-form output directly:

$$
\begin{aligned}
A_0 &: \operatorname{out}_0 - w_l' = 0, \\
A_1 &: \operatorname{out}_1 - w_r' = 0, \\
A_2 &: \operatorname{out}_2 - w_o' = 0, \\
A_3 &: \operatorname{out}_3 - w_4' = 0.
\end{aligned}
$$

Because the rows are contiguous in the `poseidon2` block, the shift lands on the real consumer:
the same four witnesses are the input to the first final-external-round gate.

This boundary has no hidden degrees of freedom: the successor is a full standard-encoded row,
and each equation has coefficient $-1$ on a distinct shifted wire. Once the current terminal quad
row determines `out`, the four successor wires $(w_l', w_r', w_o', w_4')$ are uniquely determined.

### Interior: Quad Row to Quad Row

The interior row's successor is another compressed row that commits only $s_0$ at four rounds.
The next row's `state[1..3]` values are not committed. Instead, the relation compares their
Vandermonde encoding against the encoding reconstructed from the next row's `state[0]` chain.

Note that the predicted outputs $(\operatorname{out}_0, \ldots, \operatorname{out}_3)$ are
themselves **not committed** as wires — they are symbolic linear combinations of the current
row's committed wires and S-box outputs, expanded inline by the relation. Only $w_l'$ on the
next row is a fresh witness; the equalities below relate that wire (and the next row's other
committed lane-0 wires, through the Vandermonde encoding) to a polynomial in the current row's
wires.

This enforces:

- **$A_0$:** $\operatorname{out}_0 = w_l'$ — first $s_0$ value of the next row matches the
  predicted $s_0^{(4)}$.
- **$A_1, A_2, A_3$:** the three Vandermonde combinations of
  $(\operatorname{out}_1, \operatorname{out}_2, \operatorname{out}_3)$ match the next row's
  reconstructed encoding.

Concretely, with $b_1'$, $b_2'$, and $b_3'$ reconstructed from the next row's `state[0]` chain
using the same formulas as above:

$$
\begin{aligned}
A_0 &: \operatorname{out}_0 - w_l' = 0, \\
A_1 &: \operatorname{out}_1 + \operatorname{out}_2 + \operatorname{out}_3 - b_1' = 0, \\
A_2 &: \lambda_1 \operatorname{out}_1 + \lambda_2 \operatorname{out}_2
      + \lambda_3 \operatorname{out}_3 - b_2' = 0, \\
A_3 &: \lambda_1^2 \operatorname{out}_1 + \lambda_2^2 \operatorname{out}_2
      + \lambda_3^2 \operatorname{out}_3 - b_3' = 0.
\end{aligned}
$$

Each subrelation has per-variable degree 5 before multiplying by selector and gate separator,
giving partial length 7.

This quad-row-to-quad-row transition has no hidden degrees of freedom either. `A_0` fixes the next row's first
`state[0]` value. The remaining three equations say that the Vandermonde encoding of
$(\operatorname{out}_1, \operatorname{out}_2, \operatorname{out}_3)$ equals
$(b_1', b_2', b_3')$, the encoding reconstructed from the next row's claimed `state[0]` chain.
Because the Vandermonde matrix is invertible, equality of these three encoded values is
equivalent to equality of the underlying `state[1..3]` values.

## Soundness Argument

The proof obligation is: every accepting Mega trace describes the same 56 internal rounds as the
direct standard encoding.

```text
external output
   |
   | shared witness indices + entry transition
   v
quad row 0
   |
   | quad-row-to-quad-row transition
   v
quad row 1
   |
   | repeated for rows 1..12
   v
quad row 13
   |
   | terminal transition + shared witness indices
   v
final external input
```

For each interior quad-row-to-quad-row transition:

Steps 1 and 2 are the row-local content of [QUAD_THEOREM.md](QUAD_THEOREM.md); this section
composes that theorem with the entry, interior, terminal, and shared-witness boundary checks.

1. The row's four `state[0]` values uniquely determine the hidden starting `state[1..3]` values
   by the Vandermonde reconstruction.
2. The fixed linear map `C` computes the unique four-round output `out`.
3. `A_0` fixes the successor row's first `state[0]` value to `out_0`.
4. `A_1..A_3` force the successor row's reconstructed `state[1..3]` values to equal
   `(out_1, out_2, out_3)`.

The non-interior transitions close the chain:

| Transition | Why the prover has no freedom |
|----------|-------------------------------|
| First external group -> entry row | The entry row's wires are the group's output state, pinned by the last external round's relation via `w_shift` (the rows are contiguous in the `poseidon2` block). |
| Entry row -> first quad row | The entry transition is triangular in `(w_r', w_o', w_4')`, after shared witness indices fix `w_l'`. |
| Final quad row -> first final-external row | The terminal transition directly fixes all four shifted wires of the successor, which is the first final-external round's row. |

Thus the compressed block has no independent witness channel: each committed `state[0]` value
is fixed by the previous state, and each uncommitted `state[1..3]` value is fixed implicitly by
an invertible encoding. The terminal transition then materializes the unique final full state on
the first final-external row.

## Witness Materialization

Interior quad rows materialize only the next `state[0]` witness. The relation reconstructs
`state[1..3]` algebraically when checking the row transition, so those three witnesses are not
created on non-terminal quad rows.

The terminal row materializes the full four-entry state because the following final external
rounds use the standard encoding.

```text
non-terminal quad output: create witness for next state[0] only
terminal quad output:     create witnesses for state[0], state[1], state[2], state[3]
```

This saves 39 witness variables per permutation: 13 non-terminal quad rows times 3 omitted
state entries.

## Selectors and File Map

Mega removes `q_poseidon2_internal` and adds the following Poseidon2-specific selectors:

| Selector | Purpose |
|----------|---------|
| `q_poseidon2_external_initial` | Initial external linear layer |
| `q_poseidon2_transition_entry` | Standard-to-quad boundary |
| `q_poseidon2_quad_internal` | Interior K=4 rows |
| `q_poseidon2_quad_internal_terminal` | Quad-to-standard terminal boundary |
| `q_5` | Non-gate selector for the next quad's third round constant |

`q_m`, `q_c`, and `q_5` duplicate the next quad row's first three round constants on the current
row. They are carried explicitly because Mega relations currently have shifted wire values but do
not have shifted selector values such as `q_l_shift`, `q_r_shift`, or `q_o_shift`.

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
