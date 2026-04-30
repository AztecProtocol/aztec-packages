# Batch merge protocol

For a more detailed explanation of Chonk, see [REFERENCE TO CHONK DOC].

During Chonk, a series of circuits $A_1, K_1, \dots, A_N, K_N, K_{N+1}, K_{N+2}, K_{N+3}$ defined over $\mathbb{F}_r$ (the base field of BN254) are folded into each other. Each of these circuits is allowed to perform elliptic curve operations over BN254 but instead of performing these operations in circuit we delegate them to the Goblin infrastructure.

Each kernel circuit in the sequence $K_i$ takes the commitments to the elliptic curves operations performed by the circuit it has accumulated and hashes them into a running hash. This running hash is then propagated via the public inputs so that the following kernel in the sequence can update it. More precisely, the kernel $K_i$ folds the previous kernel $K_{i-1}$ and the previous app $A_{i}$ into a running accumulator. While performing this folding, $K_i$ receives the commitments $T_{K_{i-1}}$, $T_{A_{i}}$ to the wires corresponding to elliptic curve operations (4 wires for each circuit) and the running hash $h_{K_{i-1}}$ (read from the public inputs of $K_{i-1}$). Then, it computes
$$
h_{K_i} = \text{Poseidon2}(\text{Poseidon2}(h_{K_{i-1}}, T_{K_{i-1}}), T_{A_i})
$$
and adds it to its public inputs.

The final kernel $K_{N+3}$ (the hiding kernel) receives the running hash $h$ and uses it as the source of truth in a protocol that merges all the elliptic curve operations performed by the circuits $A_1, \dots, K_{N+2}$ into a single table $T$ which the Goblin infrastructure then uses to verify the validity of the operations.

The protocol run by $K_{N+3}$ is what we call the batch merge protocol.

## The protocol

A prover and a verifier engange in the batch merge protocol for the following reason: both the prover and the verifier hold a hash value $h \in \mathbb{F}_r$, the prover wants to convince the verifier that they know a series of polynomials $f_1, \dots, f_M$ such that for a given $N \leq M$ specified by the prover:
- $h = h_N$ where $h_0$ is the empty string and $h_i = \text{Poseidon2}(h_{i-1}, T_i)$, where $T_i = [f_i]$ is the commitment to $f_i$
- a given commitment $T$ is the commitment to
$$
f = \sum_{i} X^{k_i} f_i \quad \text{where} \quad k_i = \sum_{j < i} s_i \quad \text{with} \quad \deg(f_i) < s_i
$$

In Chonk, $M$ is the largest possible stack depth allowed by the ECCVM and Translator, while $N$ is the real number of circuits that have been accumulated during proving.


### Description

**Note:** We describe the protocol as if every circuit corresponded to a single polynomial/commitment. In Chonk, each circuit corresponds to 4 polynomials/commitments. The protocol extends trivially.

Public information: $h$
Prover data: $f_1, \dots, f_N$ and $f = \sum_{i} X^{k_i} f_i$

1. The prover sends $N$
2. The prover sends commitments $T_1, \dots, T_M$ where $T_i = [f_i]$ where $f_i = 0$ if $i > N$
3. The prover sends $s_i = \deg(f_i) + 1$, where $\deg(0) = -1$
3. The prover sends commitment $T = [f]$
4. Prover and verifier compute a challenge $\alpha$
5. The prover computes $g(X) := \sum_i \alpha^{i-1} X^{s_i - 1} f_i(X^{-1})$ and sends the commitment $G = [g]$
6. The prover and the verifier compute an evaluation challenge $\kappa$
7. The prover sends evaluations $ev_{T, i} = f_i(\kappa)$, $ev_T = f(\kappa)$, $ev_g = g(\kappa^{-1})$
8. The prover and the verifier engage in Shplonk to open $T_i$ to $ev_{T,i}$ at $\kappa$, $T$ to $ev_T$ at $\kappa$, and $G$ to $g$ at $\kappa^{-1}$
9. The verifier defines $\tilde s_i = s_i$ if $i \leq N$ else $0$ and checks the validity of the following equations
    a. Concatenation check:
        $$
            \sum_{i} \kappa^{k_i} ev_{T,i} = ev_T \quad \text{where} \quad k_i = \sum_{j < i} \tilde s_i
        $$
    b. Degree check:
        $$
            \sum_i \alpha^{1 - \tilde s_i} ev_{T, i} = ev_g
        $$
    The first equation ensures that the polynomial committed in $T$ equals the the sum of the polynomials commited in $T_i$ weighted with the correct powers of $X$. The second equation ensures that the polynomials committed in $T_i$ have degree strictly smaller than $s_i$. In particular, for each $i > N$ this implies $f_i = 0$.
10. The verifier computes a list of hashes $h_i$, $i = 1, \dots, M$ where
$$
h_i = \text{Poseidon2}(h_{i-1}, T_i)
$$
and then checks $h_N = h$.

## Hash chain in the code

To minimize the number of gates arising from hashing the commitments $T_i$ to check that validity of the hash $h$, we generate the hashes using the function `get_challenge` from the `Transcript` class. In this way, the hash gates are used both to update the status of the transcript and to generate the chain $\{ h_i \}$. Note that using `get_challenge` means that $h_i$ is not a full element in $\mathbb{F}_r$, it's made up by 127 random bits. In particular, the collision probability for the hash chain is $2^{-127}$.

## Adding ZK

Inside Chonk, the commitment $T$ is added to the public inputs of the hiding kernel and is therefore part of the Chonk proof. To ensure that $T$ doesn't leak information about the operations that have been performed during accumulation, the batch merge prover adds zero-knowledge to the table by prepending a table $T_0$ made up of random operations.

The protocol operates as in the non-zk case, with the difference that after having sent the commitments $T_i$ the prover sends the commitment to the table $T_0$. The prover and the verifier then engage in the protocol to check that $T$ represents the commitment to the polynomial $\sum_{i \geq 0} X^{k_i} f_i$.

Note that the prover doesn't send $s_0$ as the table $T_0$ is degree checked against a constant size
$$
s_0 := \text{UltraEccOpsTable::ZK\_ULTRA\_OPS}
$$
