# Batch merge protocol

The batch merge protocol allows a prover to convince a verifier that a commitment $T$ to a polynomial $f_T$ represents the commitment to the merge of polynomials $f_i$, $i = 1, \dots, M$, i.e.
$$
f_T = \sum X^{k_i} f_i \quad\text{where} \quad k_i = \sum_{j < i} (\deg(f_j) + 1)
$$

The protocol hard-codes a constant $M$ which is the maximum number of subtables that can be merged. If the prover wishes $N$ tables with $N < M$, it will send commitments to the zero polynomials for $i \geq N$.

The verifier has access to a hash $h$ which works as a commitment to the $N$ tables the prover wants to merge. In Chonk, $h$ is obtained as the public input of the tail kernel.

The protocol works as follows: $P$ is the prover, $V$ is the verifier. $V$ has an hash commitment $h$. Note that we write down the protocol as if there was only one polynomial per index, in reality to each index correspond `NUM_WIRES= 4` polynomials.

1. $P$ sends to $V$ the commitments to the tables: $T_i = cm(f_i)$
2. $P$ sends the number of tables it wants to merge: $N$
3. $P$ sends the _shift sizes_: $\tilde s_i = \deg(f_i) + 1$ for $i = 1, \dots, M$
4. $V$ sets $s_i = \tilde s_i$ if $i \leq N$ else $0$
5. $P$ sends commitments to the merged table $T = cm(t)$
6. $P$ and $V$ compute random degree check challenges $1, \alpha, \alpha^2, \dots, \alpha_{M-1}$
7. $P$ computes $g(X) = \sum_i \alpha^i f_i(1/X) \cdot X^{s_i - 1}$ and sends a commitment $G = cm(g)$ to the verifier
8. $P$ and $V$ compute a random challenge $\kappa$
9. $P$ sends the evaluations $ev_{f, i} = f_i(\kappa)$, $ev_g = g(\kappa^{-1})$, $ev_t = t(\kappa)$
10. $P$ and $V$ engage in Shplonk to prove that the evaluations at step 9 are the openings of the commitments $T_i$, $G$, $T$
11. $V$ performs the following checks:
    a. $\sum_i \kappa^{k_i} \cdot ev_{f, i} = ev_t$, where $k_i = \sum_{j < i} \kappa^{s_i}$
    b. $\sum_i \alpha^i \cdot \kappa^{1 - s_i} \cdot ev_{f, i} = ev_g$
    c. $HashCheck(h, T_1, \dots, T_M)$

Check 11.a ensures that $t$ is indeed the concatenation of the polynomials $f_i$ with the correct degree shifts.

Check 11.b ensures that $f_i$ has degree smaller than $s_i$, which ensure the concatenation equation didn't allow overlapping different polynomials.

The $HashCheck$ procedure works as follows:
```
hashes = {};
hash_buffer = {};
for (i = 0; i < M; i++) {
    com = receive_commitment_from_prover();
    hash_buffer.extend(com.serialize());

    hash_val = Poseidon2::hash(hash_buffer);
    hashes.emplace_back(hash_val.lower_half());

    hash_buffer = {hash_val};
}

h.assert_equal(hashes[N]);
```

Above:
- `hash_val.lower_half()` means take the lowest `127` bits of the hash value (which is 256 bits)
- `hashes[N]` means select the $N$-th element from the array
- `com.serialize()` means serialize the commitment `(x, y)` as a series of `4` elements: lowest 128 bits of `x`, highest 128 bits of `x`, lowest 128 bits of `y`, highest 128 bits of `y`

In code this check is encoded via the transcript mechanism (which is why we split hashes in two). The hash check procedure is performed during step 1 (when the verifier receives the commitments).

## Adding zk to the final merged table

To add zk to final merged table, the protocol is modified as follows:
- After sending $T_i$ the prover sends the commitment to another table $T_0 := T_{zk}$ which is the masking table
- The verifier sets $s_0 = \text{ZK\_ULTRA\_OPS} = 8$ an hard-coded value which determines the degree of the polynomial committed in $T_0$

Then, the prover and verifier engage in the same protocol using the tables $T_0, T_1, \dots, T_M$ (one more than in the standard protocol).

## Why the tables after N are zero

As the verifier sets $s_i = 0$ for $i \geq N$, the fact that the degree check passes implies $\deg(f_i) < -1$ for $i \geq N$. This equation is only satisfied by $f_i = 0$, which implies $f_i = 0$ for $i \geq N$.

## APPEND ONLY MERGE

The merge protocol as used in Chonk before the batch merge had two methods: PREPEND and APPEND. With the batch merge we can move to an APPEND only merge. This will allow us to make various simplifications across the codebase, e.g., the EccOpsTables (ECC and ULTRA) will not need to be deques anymore, they can simply be vectors. I want to implement this change: note that we still need to distinguish the final merge from the other ones to use the fixed append mode. Instead of having PREPEND/APPEND use a bool/enum to specify whether it's fixed append merge or not. Find the optimal way to implement this change.

## WIRE BATCH MERGE INTO CHONK

When we wire the batch merge into chonk, the following things need to happen:
- The batch merge prover creates a table of zk operations that is placed on top of the concatenation of all other ecc ops. This table should replace the ecc operations that Chonk used to add to the top of the tail kernel. Note that in the tail kernel we had 1 no op + 3 random ops + one op to hide the accumulation value. These ops are now generated by the call to construct_zk_ops. Check that this movement of zk operation construction is correct.
- The merge prover in Chonk::prove needs to reconstruct the left table = the table of operations up to the tail kernel prepending the zk ops
- The merge prover in Chonk::prove needs to reconstruct the merged table = the table of operations up to the tail kernel + hiding kernel ops prepending the zk ops

Focus on the update on the ecc op queue that are required to ensure the above wiring can work:
- The method construct previous table has been replaced by one called reconstruct up to tail. This method is only used in the merge prover (which is now used only in Goblin::prove). Re-instate the construct previous table and define a new table to construct the tables up to the tail that include the zk ops (as the merge prover in the Goblin::prove requires). Use the old construct previous table in the tests (as it was used) and spin up.
- The method construct ultra ops table (the one to construct the full ultra ops table) needs to be able to recosntruct the table with zk ops on top so that it can be used in Merge prover (used inside Goblin::prove)
- Spin up a test in ecc op table test to check Tail reconstruction || new table = Full table reconstruction (check that zk ops are reconstructed correctly in tail ecc op queue reconstruction & full table reconstruction)

Simplify the changes as much as possible to have a clean API.

Then, let's update the tests in Goblin to use this new infrastructure (if any change is needed).
