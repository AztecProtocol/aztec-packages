
#  stdlib Poseidon2 Hash Implementation

Poseidon2 is a **SNARK-friendly cryptographic hash** designed to be efficient inside prime-field arithmetic circuits.
It follows the [Poseidon2 paper](https://eprint.iacr.org/2023/323.pdf) and refines the original Poseidon hash.

This implementation includes:

- A **sponge construction** over the BN254 scalar field following the (draft) C2SP Poseidon Sponge spec based on the [Duplex Sponge model](https://keccak.team/files/SpongeDuplex.pdf).
- The **Poseidon2 permutation**, i.e.\ the round function used by the sponge.
- **Circuit custom gate relations** that enforce the permutation’s correctness.


## The Sponge Construction

The sponge absorbs input elements into an internal state, applies permutations, and squeezes output elements.

#### Sponge constants.
 - **State size (t)**:  4 field elements
 - **Rate (r)**:  3 elements
 - **Capacity (c)**:  1 element


### Details

Let the input be
\f[
\mathbf{a} = (a_0, a_1, \dots, a_{N-1}).
\f]
Partition it into blocks of size \f$r=3\f$:
\f[
B_j = (a_{3j},, a_{3j+1},, a_{3j+2}) \quad\text{(pad missing entries with  0)},\qquad
m = \left\lceil \frac{N}{3}\right\rceil .
\f]

Initialize the state (with domain-separation IV):
\f[
\mathbf{s}^{(0)} = (0,0,0,\mathrm{IV}), \qquad \mathrm{IV} = (\texttt{input_length} \ll 64).
\f]

Note that we initialize \f$ \mathrm{IV} \f$ as a fixed witness. It ensures that the first invocation of the Poseidon2 permutation leads to a state where all entries are **normalized** witnesses, i.e. they have `multiplicative_constant` equal 1, and `additive_constant` equal 0.

#### Absorb phase

For each block \f$j=0,\dots,m-1\f$,
\f[
\mathbf{s}^{(j+1)} = P\left(\mathbf{s}^{(j)} + (B_j,0)\right),
\f]
where \f$P\f$ is the Poseidon2 permutation and \f$(B_j,0)\f$ is an array of size \f$ 4 \f$ with \f$r\f$ state elements and a \f$0\f$ capacity limb.

#### Squeeze (single output)

After absorption, produce one output field element via one duplex step:
\f[
y_0 = \big(P(\mathbf{s}^{(m)})\big)_0.
\f]

## The Poseidon2 Permutation

Each permutation consists of:

1. **Initial linear layer**: multiply state by external matrix \f$M_E\f$. Corresponds to  \ref bb::stdlib::Poseidon2Permutation< Builder >::matrix_multiplication_external	 "matrix_multiplication_external" method.
2. **4 External rounds (full S-box)**:
   - Record the state and the correspoding round constants \f$ c_{0}^{(i)} \f$ into a \ref bb::UltraCircuitBuilder_< FF >::create_poseidon2_external_gate "Poseidon2 External Gate".
   - _Natively_ compute the next state.
   - Re-write the state with the new witnesses.
   - After the final round, \ref bb::stdlib::Poseidon2Permutation< Builder >::record_current_state_into_next_row "record the computed state" in the next row of the Poseidon2 **external** gates block,
   as it is required for the custom gate relation.
3. **56 Internal rounds (partial S-box)**:
   - Record the state and the correspoding round constants \f$ c_{0}^{(i)} \f$ into a \ref bb::UltraCircuitBuilder_< FF >::create_poseidon2_internal_gate "Poseidon2 Internal Gate".
   - _Natively_ compute the next state.
   - Re-write the state with the new witnesses.
   - After the final round, \ref bb::stdlib::Poseidon2Permutation< Builder >::record_current_state_into_next_row "record the computed state" in the next row of the Poseidon2 **internal** gates block,
4. **Final external rounds** (same as step 2).

Note that in general, step 1 requires 6 arithmetic gates, the steps 2-4 create total number of rounds + 3 gates. Hence a single invocation of Poseidon2 Permutation results in 73 gates.
### External Matrix

\f[
M_E =
    \begin{bmatrix}
    5 & 7 & 1 & 3 \\
    4 & 6 & 1 & 1 \\
    1 & 3 & 5 & 7 \\
    1 & 1 & 4 & 6
    \end{bmatrix}
\f]


### Internal Matrix

\f[
M_I =
    \begin{bmatrix}
    D_1 & 1   & 1   & 1 \\
    1   & D_2 & 1   & 1 \\
    1   & 1   & D_3 & 1 \\
    1   & 1   & 1   & D_4
    \end{bmatrix}
\f]

## Custom Gate Relations

For an external round with state \f$ \mathbf{u}=(u_1,u_2,u_3,u_4) \f$, define \f$ \mathbf{v}=M_E\cdot\mathbf{u}\f$.
\ref bb::Poseidon2ExternalRelationImpl< FF_ > "Poseidon2 External Relation" enforces that the permuted values equal the values in the next row (accessed via shifts):
\f[
v_k = w_{k,\mathrm{shift}} \qquad \text{for } k \in \{1,2,3,4\}.
\f]

We encode four independent constraints under a selector \f$ q_{\mathrm{poseidon2_external}}\f$ and aggregate them with
independent challenges \f$ \alpha_i = \alpha_{i, Poseidon2_ext}\f$ from `SubrelationSeparators`:
\f[
q_{\mathrm{poseidon2_external}}\cdot
\Big(
\alpha_0\big(v_1 - w_{1,\mathrm{shift}}\big) +
\alpha_1\big(v_2 - w_{2,\mathrm{shift}}\big) +
\alpha_2\big(v_3 - w_{3,\mathrm{shift}}\big) +
\alpha_3\big(v_4 - w_{4,\mathrm{shift}}\big)
\Big) = 0.
\f]
To ensure that the relation holds point-wise on the hypercube, the equation above is also multiplied by the appropriate
scaling factor arising from \ref bb::GateSeparatorPolynomial< FF > "GateSeparatorPolynomial".

\ref bb::Poseidon2InternalRelationImpl< FF_ > "Internal rounds" follow the same pattern, using \f$ M_I \f$ and the partial S-box on the first element.



