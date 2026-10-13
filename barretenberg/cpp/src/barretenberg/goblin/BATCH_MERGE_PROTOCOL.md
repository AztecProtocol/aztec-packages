# Batch Merge Protocol

For a more detailed explanation of Chonk, see the [Chonk README](../chonk/README.md). The final
pairwise (latest) merge that this protocol hands off to is documented in
[MERGE_PROTOCOL.md](./MERGE_PROTOCOL.md).

During Chonk, circuits perform BN254 elliptic-curve operations that are delegated to Goblin rather than executed directly in the circuit. Each circuit exposes four `ecc_op_wire` commitments, one for each operation-table column.

The [Merge Protocol](./MERGE_PROTOCOL.md) proves one pairwise append, $M_j(X) = L_j(X) + X^\ell R_j(X)$ with $\deg(L_j) < \ell$, where $\ell$ is the fixed append shift (`compute_fixed_append_offset`), which is also the padded length of $L_j$. The Batch Merge Protocol proves, in one proof, that a committed aggregate table is the concatenation of all accumulated subtables bound by a running commitment hash, with a zero-knowledge prefix prepended by the batch merge prover. Chonk uses both: batch merge establishes the aggregate up to the tail, and the latest merge then appends the hiding-kernel table.

## Statement

The Batch Merge Protocol receives a running hash that binds a sequence of subtable commitments and proves that the output aggregate commitment opens to the concatenation of every accumulated subtable, preceded by the batch-merge ZK prefix:

$$
F_j(X) = f_{0,j}(X) + \sum_{i=1}^{N} X^{k_i} f_{i,j}(X),
\qquad
k_i = s_0 + \sum_{m < i} s_m.
$$

Here:

- $j \in \lbrace 1,2,3,4\rbrace$ indexes the op-queue columns.
- $f_{0,j}$ is the ZK-prefix column.
- $f_{i,j}$ is the $j$-th column of the $i$-th accumulated subtable.
- $s_0$ is the fixed ZK-prefix size.
- $s_i$ is the claimed size bound for subtable $i$.

## Running Commitment Hash

Each kernel updates a running hash of the op-queue commitments it observes. If the previous hash is $h_{i-1}$ and the next subtable commitments are

$$
T_i = ([f_{i,1}], [f_{i,2}], [f_{i,3}], [f_{i,4}]),
$$

then the next hash is

$$
h_i = \text{Poseidon2}(h_{i-1}, T_i).
$$

The final kernel receives the resulting hash and passes it to the batch merge verifier. The verifier recomputes the same hash chain from the commitments supplied in the batch merge proof and checks that the selected hash value equals the public input hash. In the implementation this is optimized by reusing transcript challenges: `Transcript::get_challenge("HASH_i")` updates the transcript and yields the hash-chain element.

## Protocol Statement

Let $M$ be the maximum number of subtables supported by the verifier, and let $N \leq M$ be the actual number of accumulated subtables sent by the prover. The prover and verifier work over four columns, but it is useful to write the statement per column.

Public input:

- A binding hash $h$ for the accumulated subtable commitments.

Prover data:

- Subtable polynomials $f_{i,j}$ for $i = 1,\ldots,N$ and $j = 1,\ldots,4$.
- ZK-prefix polynomials $f_{0,j}$.
- Aggregate polynomials
  $$
  F_j(X) = f_{0,j}(X) + \sum_{i=1}^{N} X^{k_i} f_{i,j}(X),
  \qquad
  k_i = s_0 + \sum_{m<i} s_m.
  $$

The verifier should be convinced that:

1. The running hash $h$ binds the commitments to $f_{1,j},\ldots,f_{N,j}$.
2. Each aggregate commitment $[F_j]$ is the concatenation of the ZK prefix and the $N$ accumulated subtables.
3. The claimed size bounds are respected:
   $$
   \deg(f_{0,j}) < s_0,\qquad \deg(f_{i,j}) < s_i \text{ for } i=1,\ldots,N.
   $$
4. The unused subtable slots $i>N$ are zero and do not affect the concatenation.

## Implemented Protocol

The implementation uses flattened table indices. Index $0$ is the ZK prefix, and indices $1,\ldots,M$ are the possible accumulated subtables. For each table index $i$ and column $j$, let $C_{i,j}$ denote the corresponding polynomial:

$$
C_{0,j} = f_{0,j}, \qquad C_{i,j} = f_{i,j} \text{ for } i \geq 1.
$$

The verifier uses size parameters

$$
\sigma_0 = \texttt{UltraEccOpsTable::ZK\_ULTRA\_OPS},
\qquad
\sigma_i =
\begin{cases}
s_i & i \leq N,\\
0 & i > N.
\end{cases}
$$

### Prover

1. Commit to all real accumulated subtable columns $[C_{i,j}]$ for $i=1,\ldots,N$.
2. Send identity commitments for unused slots $i=N+1,\ldots,M$.
3. Create and commit to the ZK-prefix columns $[C_{0,j}]$ using `ECCOpQueue::construct_zk_columns()`.
4. Send $N$ and the subtable sizes $s_i$ for all $M$ possible subtable slots.
5. Construct and commit to the merged table columns $[F_j]$.
6. Derive the batching challenges $\alpha_{i,j} := \alpha^{4i+j-1}$ (so $\alpha_{0,1} = 1$).
7. Construct the degree-check polynomial over the active slots
   $$
   G(X) = \sum_{i=0}^{N}\sum_{j=1}^{4}
          \alpha_{i,j}\, X^{\sigma_i-1} C_{i,j}(X^{-1}),
   $$
   where the $i=0$ terms are the ZK-prefix columns. Unused columns are treated as zero by the verifier.
8. Derive an evaluation challenge $\kappa$.
9. Send evaluations $C_{i,j}(\kappa)$, $F_j(\kappa)$, and $G(\kappa^{-1})$.
10. Use Shplonk/KZG to prove all claimed openings.

### Verifier

The verifier recomputes the hash chain, receives commitments/evaluations, and performs three algebraic checks before reducing all openings to a single KZG pairing check.

#### Concatenation Check

For each column $j$, the verifier checks

$$
F_j(\kappa) = C_{0,j}(\kappa) + \kappa^{\sigma_0} C_{1,j}(\kappa) + \kappa^{\sigma_0+\sigma_1} C_{2,j}(\kappa) + \cdots + \kappa^{\sum_{m=0}^{M-1}\sigma_m} C_{M,j}(\kappa).
$$

In code this is evaluated with Horner's rule from the last table slot down to the ZK prefix. Since $\sigma_i=0$ and $C_{i,j}(\kappa)=0$ for unused slots, indices $i>N$ do not contribute.

#### Degree Check

For each committed column $C_{i,j}$, the reversed-polynomial identity gives

$$
\left(X^{\sigma_i-1} C_{i,j}(X^{-1})\right)(\kappa^{-1}) = \kappa^{1-\sigma_i} C_{i,j}(\kappa)
$$

The verifier checks the batched identity

$$
G(\kappa^{-1}) = \sum_{i=0}^{M}\sum_{j=1}^{4} \alpha_{i,j}\, \kappa^{1-\sigma_i} C_{i,j}(\kappa)
$$

This proves the degree bounds $\deg(C_{i,j}) < \sigma_i$ for all active table slots, except with the batching and Schwartz-Zippel failure probabilities. For an unused slot ($\sigma_i = 0$), the reversed term $X^{-1} C_{i,j}(X^{-1})$ in the definition of $G$ is a polynomial only if $C_{i,j} = 0$. Since $[G]$ is a commitment to a polynomial, $C_{i,j}$ must be 0.


#### Hash Consistency Check

The verifier constructs an indicator array for the prover-supplied $N$ and selects the calculated hash after the $N$-th subtable. It then checks that this selected hash equals the public binding hash.

The verifier also enforces $1 \leq N \leq M$. In recursive verification this is encoded by the product

$$
\prod_{i=1}^{M}(N-i)=0.
$$

## Adding ZK

The batch merge output is part of the Goblin-facing accumulated operation table, so it must not reveal the real accumulated operations. Batch merge adds zero-knowledge by prepending a fixed-size ZK prefix $T_0$.

This prefix is produced by `ECCOpQueue::construct_zk_columns()` and consists of:

- one no-op;
- three random Ultra-only ops;
- one valid hiding op included in the ECCVM table.

The prefix size is fixed:

$$
s_0 := \texttt{UltraEccOpsTable::ZK\_ULTRA\_OPS}.
$$

The prover therefore does not send $s_0$ as a variable size. The verifier uses the constant prefix size when computing concatenation offsets and degree-check powers.

This prefix is the beginning-side ZK contribution. The hiding kernel later contributes the final random non-ops at the end of the table, and the latest Merge Protocol proves the corresponding final merge step. See `MERGE_PROTOCOL.md` for the latest-merge soundness and degree-of-freedom analysis.

## Soundness Considerations

The prover controls several values: $N$, the subtable sizes $s_i$, the column commitments, the aggregate commitments, and the evaluations. The protocol constrains these as follows:

- **Commitment binding:** KZG binds each sent commitment to a unique polynomial under the standard binding assumption.
- **Hash binding:** The public hash binds the active subtable commitments up to the collision probability of the Poseidon2 transcript hash.
- **Number of subtables:** The verifier enforces $1 \leq N \leq M$ and masks unused sizes with the indicator array.
- **Unused slots:** Slots $i>N$ are committed as identity and opened at zero. Their sizes are zeroed by the verifier.
- **Degree bounds:** The reversed-polynomial identity proves $\deg(C_{i,j}) < \sigma_i$ for each active slot.
- **Concatenation:** The random evaluation check proves that the aggregate commitments open to the concatenation determined by the same size parameters.
- **PCS openings:** Shplonk batches all openings, and KZG reduces the final claim to pairing points.

The remaining failure probabilities are the usual Schwartz-Zippel probability for the random evaluation point, batching soundness for the degree-check challenge, Shplonk batching soundness, KZG binding, and the hash-chain collision probability described above.
