$\newcommand{\fq}{\mathbb F_q}$
$\newcommand{\fr}{\mathbb F_r}$
$\newcommand{\zr}{\mathbb Z/r\mathbb Z}$
$\newcommand{\zq}{\mathbb Z/q\mathbb Z}$
$\newcommand{\NeutralElt}{\mathcal{O}}$
$\newcommand{\qadd}{q_{\text{add}}}$
$\newcommand{\qmul}{q_{\text{mul}}}$
$\newcommand{\qeq}{q_{\text{eq}}}$
$\newcommand{\qreset}{q_{\text{reset}}}$

# ECCVM (ElliptiC Curve Virtual Machine) in Barretenberg

> $\textcolor{orange}{\textsf{Warning}}$: This document is intended to provide an overview of the ECCVM in barretenberg. It is not a complete specification and does not cover all edge cases or optimizations. The source code should be consulted for a complete understanding of the implementation.

## Punchline

The ECCVM efficiently proves the correct execution of accumulated elliptic curve operations on the BN-254 curve. It does this by witnessing the correct execution into a table of numbers (in the same field as the base field of the elliptic curve) and applying polynomial constraints, multiset equality-checks, and lookup arguments.

## Notation

- $\fq$ is the prime field of size $q= 21888242871839275222246405745257275088696311157297823662689037894645226208583$.
- $\fr$ is the prime field of size $r = 21888242871839275222246405745257275088548364400416034343698204186575808495617$.
- $E/\fq$ is the elliptic curve whose Weierstrass equation is: $y^2 = x^3 + 3$. This is known as the _BN-254_ curve.
- The element $\NeutralElt$ refers to the neutral element of $E$, i.e., the point at infinity. We internally represent it in affine coordinates as $(0, 0)$ for efficiency, although $(0, 0)$ is indeed not a point on the curve!
- $C/\fr$ is the elliptic curve whose Weierstrass equation is: $y^2 = x^3 - 17$. This is known as the _Grumpkin_ curve.

We have the following facts:

- $2r>q>r$
- $C(\fr)$ is a cyclic group of order $q$, i.e., is isomorphic to $\zq$
- $E(\fq)$ is a cyclic group of order $r$, i.e., is isomorphic to $\zr$.

In general, the notation $\zq$ and $\zr$ refers to the additive abelian groups; we use $\fq$ and $\fr$ when we require the multiplicative structure. We unfortunately do not strictly abide by this convention, as this is indeed not usual in cryptography, but we think it is nonetheless helpful for disambiguating what we are using.

We also use the following constants:

- $w=\texttt{NUM\_WNAF\_DIGIT\_BITS} = 4$
- $\texttt{NUM\_SCALAR\_BITS} = 128$
- $\texttt{NUM\_WNAF\_DIGITS\_PER\_SCALAR = NUM\_SCALAR\_BITS / NUM\_WNAF\_DIGIT\_BITS} = 32$
- $\texttt{ADDITIONS\_PER\_ROW} = 4$

## Bird's eye overview/motivation

In a nutshell, the ECCVM is a simple virtual machine to facilitate the verification of native elliptic curve computations. In our setting, this means that given an `op_queue` of BN-254 operations, the ECCVM compiles the execution of these operations into an _execution trace representation_ over $\fq$, the _field of definition_ (a.k.a. base field) of BN-254. (This field is also the _scalar field_ of Grumpkin.)

In a bit more detail, the ECCVM is an compiler that takes a sequence of operations (in BN-254) and produces a table of numbers (in $\fq$), such that the correct evaluation of the sequence of operations precisely corresponds to polynomial constraints vanishing on the rows of this table of numbers. Moreover, these polynomial constraints are independent of the specific sequence of operations. As our tables of numbers have elements in $\fq$, we say that the _native field_ of the circuit is $\fq$. Looking forward, when we want to prove that all of these constraints are satisfied, we will use the Grumpkin curve $C$.

The core complication in the ECCVM comes from the _efficient_ handling of scalar multiplications. In fact, due to our MSM optimizations, we morally produce _three_ tables, where each table has its own set of multivariate polynomials, such that the correct evaluation of the operations corresponds to each table's multivariates evaluating to zero on each row. These tables will "communicate" with each other via (strict) lookup arguments and multiset-equality checks.

We alert the reader to the following earlier [documentation](https://hackmd.io/@aztec-network/rJ5xhuCsn?type=view) of the ECCVM. While the document does not exactly correspond to what is in the codebase, it is a helpful guide for navigating the ECCVM. This document is in many ways an updated version and explication of the aforementioned document.

## Op Queue

We first need to understand what the allowable operations are; the OpQueue is a roughly list of operations on a fixed elliptic curve, including a running accumulator which propagates from instruction to instruction. It may therefore be seen as a finite state machine processing simple elliptic curve operations with a single memory register.

### Operations

At any moment, we have an accumulated value $A$, and the potential operations are:
`add`, `mul`, `eq`, `reset`, `eq_and_reset`. There are four selectors: $\qadd$, $\qmul$, $\qeq$, and $\qreset$, so all the operations except for `eq_and_reset` correspond to a unique selector being on. Given an operation, we have an associated op code value.
| `EccOpCode` | Op Code Value |
|-----------|---------|
| `add` | $\texttt{1000} \equiv 8$ |
| `mul` | $\texttt{0100} \equiv 4$ |
| `eq_and_reset` | $\texttt{0011} \equiv 3$ |
| `eq` | $\texttt{0010} \equiv 2$ |
| `reset` | $\texttt{0001} \equiv 1$ |

On the level of selectors, `opcode_value`=$8\qadd + 4 \qmul + 2 \qeq + \qreset$.

#### Description of operations.

- `add` will take in a single argument: a point $P$ of my curve, and the accumulator is updated $A\leftarrow A+ P$.
- `mul` takes in two arguments: $P$, $s$, where $s\in\fr$ (i.e., $s$ is a "scalar" for our curve), and the accumulator is updated $A\leftarrow A + sP$
- `eq` takes in an argument, $P$, and "checks" that $A == P$.
- `reset` sets the accumulator to $\mathcal O$, the neutral element of the group.
- `eq_and_reset` takes in an argument, $P$, "checks" that $A == P$, and then resets the accumulator to the neutral element.

### Decomposing scalars

_Decomposing scalars_ is an important optimization for (multi)scalar multiplications that is especially helpful if we are doing many scalar multiplications where the scalar has 128 bits, i.e., is small.

Note that both $\fr$ and $\fq$ have a non-trivial cube roots of unity. (Their orders are both $1\mod(3)$.) We fix $\beta\in\fq$ to be a primitive cube root of unity. Note that $\beta$ induces an order 6 automorphism $\varphi$ of BN-254, defined on the level of points as:
$$\varphi\colon (x, y)\mapsto (\beta x, -y).$$

As $E(\fq)\cong \zr$, and the natural map $\fr\rightarrow \text{End}_{\text{ab. gp}}(\zr)$ is an isomorphism, it follows that $\varphi$ corresponds to an element $\zeta\in \fr$. Then $\zeta$ satisfies a quadratic equation: $$\zeta^2 - \zeta + 1 = 0,$$
(and indeed $\varphi$ satisfies the same equation when considered as an endomorphism). In particular, $\lambda:=-\zeta$ is a cube root of unity in $\fr$ and satisfies $\lambda^2 + \lambda + 1 = 0$.

Now, given $s\in \zr$, we wish to write $s = z_1 - \lambda z_2 = z_1 + \zeta z_2$ where $z_i$ are "small". This follows from some lattice theory. Indeed, we consider the lattice $L:=\text{ker}\big( \mathbb Z^2 \rightarrow \zr\big)$, given by $(a, b)\mapsto a + \zeta b$. Then there is a unique choice of $z_1$ and $z_2$ in any given fundamental domain. One can argue, via the Euclidean algorithm, that the fundamental domain around the origin lies in the box with side length $B:=\frac{\sqrt{3r}}{2}$. Plugging in numbers, we see $B< 2^{128}$, and the result follows. For more details, see the documentation around the `split_into_endomorphism_scalars` method in the field module.

### Column representation (a.k.a. the Input Trace)

An operation in the OpQueue may be entered into a table as follows:

| `op` | `X` | `Y` | `z_1` | `z_2` | `mul_scalar_full` |

Here, `op` is the value of the operation, $(X, Y)$ are the _affine_ coordinates of $P$, `mul_scalar_full` stands for "full scalar if the operation is `mul`" (so is an element of $\fr$), and `z_1` and `z_2` are a decomposition of `mul_scalar_full` as explained [above](#decomposing-scalars). In particular, `z_1` and `z_2` may each be represented by 128 bits.

### VM operations

The column representation is naturally equivalent to the representation as a VM operation.

```
struct ECCVMOperation {
    using Curve = curve::BN254;
    using AffineElement = Curve::Group::affine_element;
    using Fr = Curve::ScalarField;
    EccOpCode op_code = {};
    AffineElement base_point = { 0, 0 };
    uint256_t z1 = 0;
    uint256_t z2 = 0;
    Fr mul_scalar_full = 0;
    bool operator==(const ECCVMOperation& other) const = default;
};
```

### Op Queue

From the perspective of the ECCVM, the `ECCOpQueue` just contains a list of `ECCVMOperation`s, i.e., it is just an Input Trace. It is worth noting that the `ECCOpQueue` class indeed contains more moving parts, to link together the ECCVM with the rest of the Goblin protocol.

### State Machine and the execution trace

As explained, the `ECCOpQueue` corresponds to a one-register finite state machine whose primitives are a set of operations on our elliptic curve.

From this perspective, the goal of the ECCVM is to compile the execution of this state machine. The ECCVM takes in an `ECCOpQueue`, which corresponds to the execution of a list of operations in BN-254, and constructs three tables, together with a collection of multivariate polynomials for each table, along with some lookups and multiset constraints. (The number of variables of a polynomial associated with a table is precisely the number of columns of that table.) Then the key claim is that if (1) the polynomials associated to each table vanish on every row, (2) the lookups are satisfied, and some multi-set equivalences hold (which mediate _between_ tables), then the tables corresponds to the correct execution of the `ECCOpQueue`, i.e., to the correct execution of the one-register elliptic curve state machine.

Breaking abstraction, the _reason_ we choose this model of witnessing the computation is that it is straightforward to SNARK.

## Architecture

In trying to build the execution trace of `ECCOpQueue`, the `mul` opcode is the only one that is non-trivial to evaluate, especially efficiently. One straightforward way to encode the `mul` operation is to break up the scalar into its bit representation and use a double-and-add procedure. We opt for the Straus MSM algorithm with $w=4$, which requires more precomputing but is significantly more efficient.

### High level summary of the operation of the VM

Before we dive into the Straus algorithm, here is the high-level organization. We go "row by row" in the `ECCOpQueue`; if the instruction is _not_ a `mul`, the `Transcript` table handles it. If it is a `mul` operation, it is _automatically_ part of an MSM (potentially one of length 1), and we defer evaluation to the Straus mechanism (which involves two separate tables: an `MSM` table and a `Precomputed` table). Eventually, at the _end_ of an MSM (i.e., if an op is a `mul` and the next op is not), the Transcript Columns will pick up the claimed evaluation from the MSM tables and continue along their merry way.

To do this in a moderately efficient manner is involved; we include logic for skipping computations when we can. For instance, if we have a `mul` operation with the base point $P=\NeutralElt$, then we will have a column that bears witness to this fact and skip the explicit scalar multiplication. Analogously, if the scalar is 0 in a `mul` operation, we also encode skipping the explicit scalar multiplication. This intelligent computation, together with the delegation of work to multiple tables, itself required by the Straus algorithm, results in somewhat complicated column structure.

However, at least some of this complexity is forced on us; in Barretenberg, we represent the $\NeutralElt$ of an elliptic curve in Weierstrass form as $(0, 0)$ for efficiency. (Note that $\NeutralElt$ is always chosen to be the point-at-infinity and in particular it has no "affine representation". Note further that $(0, 0)$ is indeed not a point on our elliptic curve!) These issues are worth keeping in mind when examining the ECCVM.

## Straus Algorithm for MSM

Recall, our high-level goal is to compute $$\displaystyle \sum_{i=0}^{m-1} s_i P_i,$$ where $s_i\in \fr$ and $P_i$ are points on BN-254, i.e., we want to evaluate a multi-scalar multiplication of length $m$. We set $w=4$, as this is our main use-case. (In the code, this is represented as `static constexpr size_t NUM_WNAF_DIGIT_BITS = 4;`.) We have seen about that, setting $P'_i:=\varphi(P_i) = \lambda P_i$, we may write $s_iP_i = z_{i, 1}P_i - z_{i, 2}P'_i$, where $z_{i,j}$ has no more than 128 bits. We therefore assume that our scalars have no greater than 128 bits.

### wNAF

The first thing to specify is our windowed non-adjacent form (wNAF). This is an optimization for computing scalar multiplication. Moreover, the fact that we are working with an elliptic curve in Weierstrass form effectively halves the number of precomputes we need to perform.

$\textcolor{orange}{\textbf{Warning}}$: our implementation is _not_ what is usually called wNAF. To avoid confusion, we simply avoid discussion on traditional (w)NAF.

Here is the key mathematical claim: for a 128-bit positive number $s$, we can uniquely write:
$$s = \sum_{j=0}^{31} a_j 2^{4j} + \text{skew},$$
where

- each $a_j\in \{-2^{4}+1, -2^{4}+3,\ldots, 2^{4}-1\}$
- $\text{skew}\in\{0, 1\}$.

In our implementation, we force $a_{31}>0$ to guarantee that $s$ is positive. Note that the exponent in the range of the digits $a_j$ is determined by $w=\texttt{NUM\_WNAF\_DIGIT\_BITS} = 4$. The existence of the `skew` bit is to ensure that we can represent _even_ numbers.

The above decomposition is referred to in the code as the wNAF representation. Each $a_i$ is referred to either as a wNAF slice or digit.

We will come shortly to the algorithm, but as for the motivation: in our implementation, the neutral point of the group (i.e., point-at-infinity) poses some technical challenges for us. We work with the _affine_ representation of elliptic curve points, and $\NeutralElt$ certainly has no natural affine-coordiante representation. We choose to internally represent it as $(0, 0)$ (not a point on our curve!) and handle it with separate logic. It is therefore advantageous to avoid having to extraneously perform operations involving $\NeutralElt$, especially when we are implementing the recursive ECCVM verifier.

### Straus

Here is the problem: efficiently compute $$\displaystyle \sum_i s_i P_i,$$ where the $s_i$ are 128-bit numbers and $P_i$ are points in BN-254. (Recall that we reduce to the case of 128-bit scalars by decomposing, as explained [above](#decomposing-scalars).)

To do this, we break up our computation into steps.

#### Precomputation

For each $s_i$, we expand it in wNAF form:$s_i = \sum_{j=0}^{31} a_{i, j} 2^{4j} + \text{skew}_i$.

For every $P_i$, precompute and store the multiples: $$\{-15P_i, -13P_i, \ldots, 13P_i, 15P_i\}$$
as well as $2P_i$. Note that, $E$ is represented in Weierstrass form, $nP$ and $-nP$ have the same affine $y$-coordinate and the $x$-coordinates differ by a sign.

#### Algorithm

Here are the static variables we need.

- `NUM_WNAF_DIGITS_PER_SCALAR=32`.
- `NUM_WNAF_DIGIT_BITS = 4`.
- `ADDITIONS_PER_ROW = 4`. This says that we can do 4 primitive EC additions per "row" of the virtual machine.

1. Set $A = \NeutralElt$ to be the neutral element of the group.
2. For $j\in [0, \ldots, 31]$, do:
   1. For $k\in [0,\ldots, \lceil \frac{m-1}{4}\rceil]$ (here, $k$ is the "row" in the VM), do:
      1. Set $A\leftarrow A + a_{4k, 31-j}P_{4k} + a_{4k+1, 31-j}P_{4k+1} + a_{4k+2, 31-j}P_{4k+2} + a_{4k+3, 31-j}P_{4k+3}$, where the individual scalar multiples are _looked up_ from the precomputed tables indicated in [precomputation](#precomputation). (No accumulations if the points $P_{4k+j}$ don't exist, which can potentially hold for $k=\lceil \frac{m-1}{4}\rceil$ and some $j$.)
   2. If $j\neq 31$, set $A\leftarrow 2^w A= 16 A$.
3. For $j = 32$, do:
   1. For $k\in [0,\ldots, \lceil \frac{m-1}{4}\rceil]$, do:
      1. Set $A\leftarrow A + \text{skew}_{4k}P_{4k} + \text{skew}_{4k+1}P_{4k+1} + \text{skew}_{4k+2}P_{4k+2} + \text{skew}_{4k+3}P_{4k+3}$.
4. Return $A$.

We picture this algorithm as follows. We build a table, the $i^{\text{th}}$ row of which is the wNAF expansion of $s_i$ in most-significant to least-significant order. This means that the first column corresponds to the most significant digit ($a_{-, 31}$).

We work column by column (this is the $j$-loop); for every vertical chunk of 4 elements, we accumulate (i.e., add to an accumulator $A$) looked up values corresponding to the digit/base-point pair. In the pseudo-code, we have an index $31-j$ because we want to proceed in decreasing order of significant digits. (Looking forward, a "row" of the MSM table in the ECCVM can handle 4 such additions.) We do this until we exhaust the column. We then multiply the accumulator by $16$ (as long as we are not at the last digit) and go to the next column. Finally, at the end we handle the `skew` digit.

## Tables

We have three tables that mediate the computation. As explained above, all of the computations are easy except for scalar multiplications. We process the computation and chunk what looks like scalar multiplications into MSMs. Here is the brief outline.

- `transcript_builder`. The transcript columns organize and process all of the computations _except for the scalar multiplications_. In particular, the Transcript Columns _do not bear witness_ to the intermediate computations necessary for MSMs. However, they still "access" the results of these computations.
- `precomputed_tables_builder`. The precomputed columns are: for every $P$ that occurs in an MSM (which was syntactically pulled out by the `transcript_builder`), we compute/store $\{P, 3P, \ldots, 15P, 2P\}$.
- `msm_builder` actually computes/constrains the MSMs via the Straus algorithm.

A final note: apart from three Lagrange columns, all columns are either 1. part of the input trace; or 2. witness columns committed to by the Prover.

In the following tables, each column has a defined "value range". If the range is not
$\fq$, the column must be range constrained, either with an explicit range check or implicitly through range constraints placed on other columns that define relations over the target column.

### Transcript Columns

| column name                                | builder name                    | value range   | computation                                                                                                                          | description                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|                                            |                                 |               | $\textcolor{blue}{\textbf{Populated in the first loop}}$                                                                             |                                                                                                                                                                                                                    |
| transcript_msm_infinity                    | transcript_msm_infinity         | $\{0, 1 \}$   | `msm_output.is_point_at_infinity();`                                                                                                 | are we at the end of an MSM \_and\* is the output the point at infinity?                                                                                                                                           |
| transcript_accumulator_not_empty           | accumulator_not_empty           | $\{0, 1 \}$   | `row.accumulator_not_empty = !state.is_accumulator_empty;`, `final_row.accumulator_not_empty = !updated_state.is_accumulator_empty;` | not(is the accumulator either empty or point-at-infinity?)                                                                                                                                                         |
| transcript_add                             | q_add                           | $\{0, 1 \}$   |                                                                                                                                      | is opcode                                                                                                                                                                                                          |
| transcript_mul                             | q_mul                           | $\{0, 1 \}$   |                                                                                                                                      | is opcode                                                                                                                                                                                                          |
| transcript_eq                              | q_eq                            | $\{0, 1\}$    |                                                                                                                                      | is opcode                                                                                                                                                                                                          |
| transcript_reset_accumulator               | q_reset_accumulator             | $\{0, 1 \}$   |                                                                                                                                      | does opcode reset accumulator?                                                                                                                                                                                     |
| transcript_msm_transition                  | msm_transition                  | $\{0, 1\}$    | `msm_transition = is_mul && next_not_msm && (state.count + num_muls > 0);`                                                           | are we at the end of an msm? i.e., is current transcript row the final `mul` opcode of a MSM                                                                                                                       |
| transcript_pc                              | pc                              | $\fq$         | `updated_state.pc = state.pc - num_muls;`                                                                                            | _decreasing_ program counter. Only takes into count `mul` operations, not `add` operations.                                                                                                                        |
| transcript_msm_count                       | msm_count                       | $\fq$         | `updated_state.count = current_ongoing_msm ? state.count + num_muls : 0;`                                                            | Number of muls so far in the \*current\* MSM (NOT INCLUDING the current step)                                                                                                                                      |
| transcript_msm_count_zero_at_transition    | msm_count_zero_at_transition    | $\{0, 1\}$    | `((state.count + num_muls) == 0) && entry.op_code.mul && next_not_msm;`                                                              | is the number of scalar muls we have completed at the end of our "MSM block" zero? (note that from the definition, if this variable is non-zero, then `msm_transition == 0`.)                                      |
| transcript_Px                              | base_x                          | $\fq$         |                                                                                                                                      | (input trace) $x$-coordinate of base point $P$                                                                                                                                                                     |
| transcript_Py                              | base_y                          | $\fq$         |                                                                                                                                      | (input trace) $y$-coordinate of base point $P$                                                                                                                                                                     |
| transcript_base_infinity                   | base_infinity                   | $\{0, 1\}$    |                                                                                                                                      | is $P=\NeutralElt$?                                                                                                                                                                                                |
| transcript_z1                              | z1                              | $[0,2^{128})$ |                                                                                                                                      | (input trace) first part of decomposed scalar                                                                                                                                                                      |
| transcript_z2                              | z2                              | $[0,2^{128})$ |                                                                                                                                      | (input trace) second part of decomposed scalar                                                                                                                                                                     |
| transcript_z1zero                          | z1_zero                         | $\{0, 1\}$    |                                                                                                                                      | is z1 zero?                                                                                                                                                                                                        |
| transcript_z2zero                          | z2_zero                         | $\{0, 1\}$    |                                                                                                                                      | is z2 zero?                                                                                                                                                                                                        |
| transcript_op                              | op_code                         | $\in \fq$     | `entry.op_code.value();`                                                                                                             | 8 `q_add` + 4 `q_mul` + 2 `q_eq` + `q_reset`                                                                                                                                                                       |
|                                            |                                 |               | $\textcolor{blue}{\textbf{Populated after converting from projective to affine coordinates}}$                                        |                                                                                                                                                                                                                    |
| transcript_accumulator_x                   | accumulator_x                   | $\fq$         |                                                                                                                                      | x-coordinate of accumulator $A$                                                                                                                                                                                    |
| transcript_accumulator_y                   | accumulator_y                   | $\fq$         |                                                                                                                                      | y-coordinate of accumulator $A$                                                                                                                                                                                    |
| transcript_msm_x                           | msm_output_x                    | $\fq$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) + `offset_generator()` = `(msm_output_x, msm_output_y)`, else 0                                                                                                    |
| transcript_msm_y                           | msm_output_y                    | $\fq$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) + `offset_generator()` = `(msm_output_x, msm_output_y)`, else 0                                                                                                    |
| transcript_msm_intermediate_x              | transcript_msm_intermediate_x   | $\fq$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) = `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`, else 0                                                                                         |
| transcript_msm_intermediate_y              | transcript_msm_intermediate_y   | $\fq$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) = `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`, else 0                                                                                         |
| transcript_add_x_equal                     | transcript_add_x_equal          | $\{0, 1\}$    | `(vm_x == accumulator_x) or (vm_infinity && accumulator_infinity);`                                                                  | do the accumulator and the point we are adding have the same $x$-value? (here, the two point we are adding is either part of an `add` instruction or the output of an MSM). 0 if we are not accumulating anything. |
| transcript_add_y_equal                     | transcript_add_y_equal          | $\{0, 1\}$    | `(vm_y == accumulator_y) or (vm_infinity && accumulator_infinity);`                                                                  | do the accumulator and the point we are adding have the same $y$-value? 0 if we are not accumulating anything.                                                                                                     |
| transcript_base_x_inverse                  | base_x_inverse                  | $\fq$         |                                                                                                                                      | if adding a point to the accumulator and the $x$ values are not equal, the inverse of the difference of the $x$ values. (witnesses `transcript_add_x_equal == 0`                                                   |
| transcript_base_y_inverse                  | base_y_inverse                  | $\fq$         |                                                                                                                                      | if adding a point to the accumulator and the $y$ values are not equal, the inverse of the difference of the $y$ values. (witnesses `transcript_add_y_equal == 0`                                                   |
| transcript_add_lambda                      | transcript_add_lambda           | $\fq$         |                                                                                                                                      | if adding a point into the accumulator, contains the lambda gradient: the slope of the line between $A$ and $P$                                                                                                    |
| transcript_msm_x_inverse                   | transcript_msm_x_inverse        | $\fq$         |                                                                                                                                      | used to validate transcript_msm_infinity correct; if the former is zero, this is the inverse of the $x$ coordinate of the (non-shifted) output of the MSM                                                          |
| transcript_msm_count_at_transition_inverse | msm_count_at_transition_inverse | $\fq$         |                                                                                                                                      | used to validate transcript_msm_count_zero_at_transition                                                                                                                                                           |

### Transcript description and algorithm

In the above table, we have a reference what the transcript columns are. Here, we provide a natural-language summary of witness-generation, which in turn directly implies what the constraints should look like. Some of the apparent complexity comes from the fact that, for efficiency, we do operations in _projective coordinates_ and then normalize them all at the end. (This requires fewer field-inversions.)

$\newcommand{\transcriptmsminfinity}{{\color{purple}\mathrm{transcript\_msm\_infinity}}}$
$\newcommand{\transcriptaccumulatornotempty}{{\color{purple}\mathrm{transcript\_accumulator\_not\_empty}}}$
$\newcommand{\transcriptadd}{{\color{purple}\mathrm{transcript\_add}}}$
$\newcommand{\transcriptmul}{{\color{purple}\mathrm{transcript\_mul}}}$
$\newcommand{\transcripteq}{{\color{purple}\mathrm{transcript\_eq}}}$
$\newcommand{\transcriptresetaccumulator}{{\color{purple}\mathrm{transcript\_reset\_accumulator}}}$
$\newcommand{\transcriptmsmtransition}{{\color{purple}\mathrm{transcript\_msm\_transition}}}$
$\newcommand{\transcriptpc}{{\mathrm{transcript\_pc}}}$
$\newcommand{\transcriptmsmcount}{{\mathrm{transcript\_msm\_count}}}$
$\newcommand{\transcriptmsmcountzeroattransition}{{\color{purple}\mathrm{transcript\_msm\_count\_zero\_at\_transition}}}$
$\newcommand{\transcriptpx}{{\mathrm{transcript\_Px}}}$
$\newcommand{\transcriptpy}{{\mathrm{transcript\_Py}}}$
$\newcommand{\transcriptbaseinfinity}{{\color{purple}\mathrm{transcript\_base\_infinity}}}$
$\newcommand{\transcriptzone}{{\mathrm{transcript\_z1}}}$
$\newcommand{\transcriptztwo}{{\mathrm{transcript\_z2}}}$
$\newcommand{\transcriptzonezero}{{\color{purple}\mathrm{transcript\_z1zero}}}$
$\newcommand{\transcriptztwozero}{{\color{purple}\mathrm{transcript\_z2zero}}}$
$\newcommand{\transcriptop}{{\mathrm{transcript\_op}}}$
$\newcommand{\transcriptaccumulatorx}{{\mathrm{transcript\_accumulator\_x}}}$
$\newcommand{\transcriptaccumulatory}{{\mathrm{transcript\_accumulator\_y}}}$
$\newcommand{\transcriptmsmx}{{\mathrm{transcript\_msm\_x}}}$
$\newcommand{\transcriptmsmy}{{\mathrm{transcript\_msm\_y}}}$
$\newcommand{\transcriptmsmintermediatex}{{\mathrm{transcript\_msm\_intermediate\_x}}}$
$\newcommand{\transcriptmsmintermediatey}{{\mathrm{transcript\_msm\_intermediate\_y}}}$
$\newcommand{\transcriptaddxequal}{{\color{purple}\mathrm{transcript\_add\_x\_equal}}}$
$\newcommand{\transcriptaddyequal}{{\color{purple}\mathrm{transcript\_add\_y\_equal}}}$
$\newcommand{\transcriptbasexinverse}{{\mathrm{transcript\_base\_x\_inverse}}}$
$\newcommand{\transcriptbaseyinverse}{{\mathrm{transcript\_base\_y\_inverse}}}$
$\newcommand{\transcriptaddlambda}{{\mathrm{transcript\_add\_lambda}}}$
$\newcommand{\transcriptmsmxinverse}{{\mathrm{transcript\_msm\_x\_inverse}}}$
$\newcommand{\transcriptmsmcountattransitioninverse}{{\mathrm{transcript\_msm\_count\_at\_transition\_inverse}}}$

We start our top row with $\transcriptmsmcount = 0$ and $\transcriptaccumulatornotempty = 0$. This corresponds to saying "there are no active multiplications in our MSM" and "the accumulator is $\NeutralElt$".

We process each `op`.

If the `op` is an `add`, we process the addition as follows. We have an accumulated value $A$ and a point $P$ to add. If $\transcriptbaseinfinity = 1$, we don't need to do anything: $P=\NeutralElt$. Similarly, if $\transcriptaccumulatornotempty = 0$, then we just (potentially) need to change $\transcriptaccumulatornotempty$, $\transcriptaccumulatorx$ and $\transcriptaccumulatory$. Otherwise, we need to check $\transcriptaddxequal$: the formula for point addition requires dividing by $\Delta x$, and in particular is not well-constrained either when adding points that are negative of each other or adding the same point to itself. (These two cases may be easily distinguished by examining $\transcriptaddyequal$). If we are _not_ in this case, we need the help of of $\transcriptaddlambda$, which is the slope between the points $P$ and $A$. (This slope will happily not be $\infty$, as we have ruled out the only occasions it had to be.)

The value $A\leftarrow A + P$ will of course involve different $\transcriptaccumulatorx$ and $\transcriptaccumulatory$, but may also cause $\transcriptaccumulatornotempty$ to flip.

We emphasize: we _do not_ modify $\transcriptpc$ in this case. Indeed, that variable is only modified based on the number of small scalar `mul`s we are doing.

If the `op` is `eq`, we process the op as follows. We have an accumulated value $A$ and a point $P$. Due to our non-uniform representation of $\NeutralElt$, we must break up into cases.

- Both are $\NeutralElt$ (i.e., $\transcriptaccumulatornotempty = 0$ and $\transcriptbaseinfinity=1$). Then accept!
- Neither is equal to $\NeutralElt$. Then we linearly compare $\transcriptaccumulatorx-\transcriptpx$ and $\transcriptaccumulatory-\transcriptpy$ and accept if both are $0$.
- Exactly one is equal to $\NeutralElt$. Then reject!

If our `op` is `eq_reset`, we do the same as for `eq`, but we also set $\transcriptaccumulatornotempty\leftarrow 0$.

If our `op` is a `mul`, with scalars `z1` and `z2`, the situation is more complicated. Now we have to update auxiliary wires. As explained, _every_ `mul` operation is understood to be part of an MSM.

- $\transcriptmsmcount$ counts the number of active short-scalar multiplications _up to and not including_ the current `mul` op. The value of this column at the _next_ row increments by $2 - \transcriptzonezero - \transcriptztwozero$.
- In other words, we simply avoid (our deferred) computations if $\transcriptzonezero = 1$ and/or $\transcriptztwozero = 1$.
- Similarly, $\transcriptpc$ _decrements_ by $2 - \transcriptzonezero - \transcriptztwozero$. We use a decreasing program counter (only counting short `mul`s) for efficiency reasons, as it allows for cheaper commitments.
- If the next `op` is not a `mul`, and the total number of active `mul` operations (which is $\transcriptmsmcount + (2 - \transcriptzonezero - \transcriptztwozero)$) is non-zero, set the $\transcriptmsmtransition = 1$. Else, set $\transcriptmsmcountzeroattransition = 1$. Either way, the current `mul` then represents the end of an MSM. This is where $\transcriptmsmcountattransitioninverse$ is used.
- If $\transcriptmsmtransition = 0$, then $\transcriptmsmx$, $\transcriptmsmy$, $\transcriptmsmintermediatex$, and $\transcriptmsmintermediatey$ are all $0$. (In particular, this holds when we are in the middle of an MSM.) Otherwise, we call $\transcriptmsmx$ and $\transcriptmsmy$ from the multiset argument, i.e., from the MSM table. Then the values of $\transcriptmsmintermediatex$ and $\transcriptmsmintermediatey$ are obtained by subtracting off the `OFFSET`.

#### Transcript size

The size of the _non-zero_ part of the table is the length of the `OpQueue` + 1 (we have shiftable columns). We have organized our wire values so that zero-padding is compatible with the polynomial constraints. (See e.g. the _decreasing_ program counter.)

### Precomputed Columns

As the set of precomputed columns is small, we include the code snippet.

```
    struct PointTablePrecomputationRow {
        int s1 = 0;
        int s2 = 0;
        int s3 = 0;
        int s4 = 0;
        int s5 = 0;
        int s6 = 0;
        int s7 = 0;
        int s8 = 0;
        bool skew = false;
        bool point_transition = false;
        uint32_t pc = 0;
        uint32_t round = 0;
        uint256_t scalar_sum = 0;
        AffineElement precompute_accumulator{
            0, 0
        }; // contains a precomputed element, i.e., something in {P, 3P, ..., 15P}.
        AffineElement precompute_double{ 0, 0 };
    };

```

As discussed in [Decomposing Scalars](#decomposing-scalars), WLOG our scalars have 128 bits and we may expand them in $w=4$ [wNAF](#wnaf):

$$s = \sum_{j=0}^{31} a_j 2^{4j} + \text{skew},$$
where

- each $a_j\in \{-2^{4}+1, -2^{4}+3,\ldots, 2^{4}-1\}$
- $\text{skew}\in\{0, 1\}$.

Given a wNAF digit $\in \{-15, -13, \ldots, 15\}$, we $\text{compress}$ it via the map:
$$\text{compress}\colon d\mapsto \frac{d+15}{2},$$
which is of course a bijection $\{-15, -13, \ldots, 15\}\rightarrow \{0,\ldots, 15\}$. (This compression is helpful for indexing later: looking forward, the values $[-15P, -13P, \ldots, 15P]$ will be stored in an array, so if we want to looking up $kP$, where $k\in \{-15, -13, \ldots, 15\}$, we can go to the $\text{compress}(k)$ index of our array associated to $P$.)

The following is one row in the Precomputed table; there are `NUM_WNAF_DIGITS_PER_SCALAR / WNAF_DIGITS_PER_ROW == 32/4 = 8` rows. The row index is `i`. (This number is is also witnessed as `round`.)
| column name | builder name | value range | computation | description |
| ----------- | ---------------------- | ----------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| precompute_s1hi | s1 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - 4i})$ |
| precompute_s1lo | s2 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - 4i})$ |
| precompute_s2hi | s3 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - (4i + 1)})$ |
| precompute_s2lo | s4 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - (4i + 1)})$ |
| precompute_s3hi | s5 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - (4i + 2)})$ |
| precompute_s3lo | s6 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - (4i + 2)})$ |
| precompute_s4hi | s7 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - (4i + 3)})$ |
| precompute_s4lo | s8 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - (4i + 3)})$ |
| precompute_skew | skew | $\{0,1\}$ | | skew bit |
| precompute_point_transition | point_transition | $\{0,1\}$ | | are we at the last row corresponding to this scalar? |
| precompute_pc | pc | $\fq$ | | value of the program counter of this EC operation |
| precompute_round | round | $\fq$ | | "row" of the computation, i.e., `i`. |
| precompute_scalar_sum | scalar_sum | $\fq$ | | sum up-to-now of the digits |
| precompute_tx, precompute_ty | precompute_accumulator | $E(\fq)\subset \fq\times \fq$ | | $(15-2i)P$ |
| precompute_dx, precompute_dy | precompute_double | $E(\fq)\subset \fq\times \fq$ | | $2P$ |
| precompute_select | | $\{0,1\}$ | | if 1, evaluate Straus precomputation algorithm at current row |

### Precomputed Description and Algorithm

$\newcommand{\precomputesonehi}{{\color{teal}\mathrm{precompute\_s1hi}}}$
$\newcommand{\precomputesonelo}{{\color{teal}\mathrm{precompute\_s1lo}}}$
$\newcommand{\precomputestwohi}{{\color{teal}\mathrm{precompute\_s2hi}}}$
$\newcommand{\precomputestwolo}{{\color{teal}\mathrm{precompute\_s2lo}}}$
$\newcommand{\precomputesthreehi}{{\color{teal}\mathrm{precompute\_s3hi}}}$
$\newcommand{\precomputesthreelo}{{\color{teal}\mathrm{precompute\_s3lo}}}$
$\newcommand{\precomputesfourhi}{{\color{teal}\mathrm{precompute\_s4hi}}}$
$\newcommand{\precomputesfourlo}{{\color{teal}\mathrm{precompute\_s4lo}}}$
$\newcommand{\precomputeskew}{{\color{purple}\mathrm{precompute\_skew}}}$
$\newcommand{\precomputepointtransition}{{\color{purple}\mathrm{precompute\_point\_transition}}}$
$\newcommand{\precomputepc}{{\mathrm{precompute\_pc}}}$
$\newcommand{\precomputeround}{{\mathrm{precompute\_round}}}$
$\newcommand{\precomputescalarsum}{{\mathrm{precompute\_scalar\_sum}}}$
$\newcommand{\precomputetx}{{\mathrm{precompute\_tx}}}$
$\newcommand{\precomputety}{{\mathrm{precompute\_ty}}}$
$\newcommand{\precomputedx}{{\mathrm{precompute\_dx}}}$
$\newcommand{\precomputedy}{{\mathrm{precompute\_dy}}}$
$\newcommand{\preselect}{{\mathrm{precompute\_select}}}$
First, let us recall the structure of `ScalarMul`.

```
template <typename CycleGroup> struct ScalarMul {
    uint32_t pc;
    uint256_t scalar;
    typename CycleGroup::affine_element base_point;
    std::array<int, NUM_WNAF_DIGITS_PER_SCALAR>
        wnaf_digits; // [a_{n-1}, a_{n-1}, ..., a_{0}], where each a_i ∈ {-2ʷ⁻¹ + 1, -2ʷ⁻¹ + 3, ..., 2ʷ⁻¹ - 3, 2ʷ⁻¹ -
                     // 1} ∪ {0}. (here, w = `NUM_WNAF_DIGIT_BITS`). in particular, a_i is an odd integer with
                     // absolute value less than 2ʷ. Represents the number `scalar` = ∑ᵢ aᵢ 2⁴ⁱ - `wnaf_skew`.
    bool wnaf_skew; // necessary to represent _even_ integers
    // size bumped by 1 to record base_point.dbl()
    std::array<typename CycleGroup::affine_element, POINT_TABLE_SIZE + 1> precomputed_table;
};
```

Note that, with respect to the decomposition in [wnaf](#wnaf), `wnaf_digits[i]`= $a_{31-i}$. Indeed, the order of the array `wnaf_digits` is from highest-order to lowest-order.

Given a `ScalarMul`, it is easy to construct the 8 rows of the Precomputed Table. As explained, `WNAF_DIGITS_PER_ROW = 4`; hence the `NUM_WNAF_DIGITS_PER_SCALAR = 32` digits in may be broken up into 8 rows, where each row corresponds to 4 wNAF digits, each of which is in $\{-15, -13, \ldots, 13, 15\}$.

1. For $i = 0 .. 7$

   1. For each of the 4 digits in the row: `wnaf_digits[4i]`, `wnaf_digits[4i+1]`, `wnaf_digits[4i+2]`, and `wnaf_digits[4i+3]`, `compress` from $\{-15, -13, \ldots, 13, 15\}\rightarrow \{0,\ldots 15\}$ via the monotonic map $z\mapsto \frac{z+15}{2}$. Then our compressed digits are in the latter range.
   2. extract the first and last pair of bits and fill in order in corresponding parts of the table: $\precomputesonehi$, $\precomputesonelo$, $\precomputestwohi$, $\precomputestwolo$, $\precomputesthreehi$, $\precomputesthreelo$, $\precomputesfourhi$, $\precomputesfourlo$ correspond to the 2-bit decompositions of the compressed wNAF digits.
   3. The value $\precomputepointtransition$ is set to 1 if this is the last row (i.e., `i == 7`) for the current scalar, else 0. This tracks if the next row in the table corresponds to a new `ScalarMul`.
   4. The value $\precomputepc$ is copied from the corresponding `ScalarMul.pc`.
   5. The value $\precomputeround$ is set to the row index `i`.
   6. The value $\precomputescalarsum$ accumulates the _scalar reconstruction_: $\displaystyle \sum_{j=0}^{4i+3} a_{31-j} \cdot 2^{4j}$. (Here, our current row is $i$.) In other words: at row $i$, we implicit consider the string of digits `wnaf_digits[0]`, ..., `wnaf_digits[4i+3]`; $\precomputescalarsum$ is precisely the value of the $4i$-digit number corresponding to this string of digits.
   7. The value $(\precomputetx, \precomputety)$ stores the precomputed point $(15-2i)P$. (Note that this reflects a coincidence: the number of rows (per scalar multiplication) is same as the number of odd multiples of $P$ that we need to store.)
   8. The value $(\precomputedx, \precomputedy)$ stores $2P$. (In particular, $2P$ is stored on all $8$ rows coming from a given `ScalarMul`.)

The constraints are straightforward.

- We must range constrain the $\precomputesonehi$, $\precomputesonelo$, $\precomputestwohi$, $\precomputestwolo$, $\precomputesthreehi$, $\precomputesthreelo$, $\precomputesfourhi$, $\precomputesfourlo$. We do this via the polynomial $((x-1)^2 - 1)((x-2)^2-1)$, a quartic constraint.
- We constrain that $\precomputescalarsum$ is updated correctly at each row.
- When $\precomputepointtransition = 1$, when we constrain that original `scalar` is $\precomputescalarsum - \precomputeskew$.
- We constrain the elliptic curve values. Note that we may assume that $P\neq \NeutralElt$; indeed, we only populate this table when we are doing non-trivial scalar multiplications. It follows that $nP\neq \NeutralElt$ for $0<n< r$, as $r$ is prime. This means that the following constraints have _no special case analysis_:

  - if $\precomputepointtransition = 1$, constrain $2P = (\precomputedx, \precomputedy)$
  - if $\precomputepointtransition = 0$, constrain $(\textbf{shift}(\precomputedx), \textbf{shift}(\precomputedy)) = (\precomputedx, \precomputedy)$. (Here, $\textbf{shift}$ means "the next value of the column".)
  - if $\precomputepointtransition = 0$, constrain $$(\textbf{shift}(\precomputetx), \textbf{shift}(\precomputety)) = (\precomputedx, \precomputedy) + (\precomputetx, \precomputety),$$where the latter addition of course happens on $E$.

- We emphasize that these EC constraints will only be turned on after the first row, as these values have no _neutral_ value that we can use for the first row (especially as it is critical that they are never $\NeutralElt$).
- We constrain $\precomputeround$ as follows. (Note that it _is not_ naively range-constrained.)
  - If $\precomputepointtransition = 1$, then set $\precomputeround = 7$ and $\textbf{shift}(\precomputeround) = 0$. (We are at the end of this block of precomputes for our `ScalarMul`), so if the next block is to be well-formed, the next round element better be $0$. Note that this is compatible with zero-padding.
  - If $\precomputepointtransition = 0$, set $\textbf{shift}(\precomputeround) - \precomputeround = 1$.

### Precomputed Size

For every _non-trivial_ short scalar `mul`, we fill in $8$ non-trivial rows to the precomputed table. Here, non-trivial means: $P\neq \NeutralElt$ and $z\neq 0$, where $z$ is the short (128-bit) scalar we are multiplying by. This means that for $m$ (non-trivial) short scalar `mul` operations, we add $8m$ rows to the precomputed table.

### MSM columns

This table is the most algorithmically involved.

```
struct alignas(64) MSMRow {
        uint32_t pc = 0;        // counter over all half-length (128 bit) scalar muls used to compute the required MSMs
        uint32_t msm_size = 0;  // the number of points in the current MSM. (this is _constant_ on MSM blocks.)
        uint32_t msm_count = 0; // number of multiplications processed so far in current MSM round
        uint32_t msm_round = 0; // current "round" of MSM, in {0, ..., 32}. (final round deals with the `skew` bit.)
                                // here, 32 = `NUM_WNAF_DIGITS_PER_SCALAR`.
        bool msm_transition = false; // is 1 if the *current* row starts the processing of a different MSM, else 0.
        bool q_add = false;
        bool q_double = false;
        bool q_skew = false;

        // Each row in the MSM portion of the ECCVM can handle (up to) 4 point-additions.
        // For each row in the VM we represent the point addition data via a size-4 array of
        // AddState objects.
        struct AddState {
            bool add = false; // are we adding a point at this location in the VM?
                              // e.g if the MSM is of size-2 then the 3rd and 4th AddState objects will have this set
                              // to `false`.
            int slice = 0; // wNAF slice value. This has values in {0, ..., 15} and corresponds to an odd number in the
                           // range {-15, -13, ..., 15} via the monotonic bijection.
            AffineElement point{ 0, 0 }; // point being added into the accumulator
            FF lambda = 0; // when adding `point` into the accumulator via Affine point addition, the value of `lambda`
                           // (i.e., the slope of the line). (we need this as a witness in the circuit.)
            FF collision_inverse = 0; // collision_inverse` is used to validate we are not hitting point addition edge
                                      // case exceptions, i.e., we want the VM proof to fail if we're doing a point
                                      // addition where (x1 == x2). to do this, we simply provide an inverse to x1 - x2.
        };
        std::array<AddState, 4> add_state{ AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 } };
        FF accumulator_x = 0;
        FF accumulator_y = 0;
    };
```

| column name       | builder name                   | value range | computation                          | description                                                                                                                                                                              |
| ----------------- | ------------------------------ | ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| msm_pc            | pc                             | $\fq$       |                                      | counter over all half-length (128 bit) scalar muls used to compute the required MSMs                                                                                                     |
| msm_size_of_msm   | msm_size                       | $\fq$       |                                      | the number of points that will be scaled and summed                                                                                                                                      |
| msm_count         | msm_count                      | $\fq$       |                                      | number of (128-bit) multiplications processed so far in current MSM round (NOT INCLUDING? current round?)                                                                                |
| msm_round         | msm_round                      | $[0, 32]$   |                                      | current "round" of MSM, in $\{0, \ldots, 32\}$, which corresponds to the wNAF digit being processed. (final round deals with the `skew` bit.)                                            |
| msm_transition    | msm_transition                 | $\{0, 1\}$  | `(digit_idx == 0) && (row_idx == 0)` | is 1 if the current row starts the processing of a different MSM, else 0 . Note this _not_ the same as the description of `transcript_msm_transition`                                    |
| msm_add           | q_add                          | $\{0, 1\}$  |                                      | 1 if we are adding points in the Straus MSM algorithm at current row                                                                                                                     |
| msm_double        | q_double                       | $\{0, 1\}$  |                                      | 1 if we are doubling accumulator in the Straus MSM algorithm at current row                                                                                                              |
| msm_skew          | q_skew                         | $\{0, 1\}$  |                                      | 1 if we are incorporating skew points in the Straus MSM algorithm at current row                                                                                                         |
| msm_x1            | add_state[0].point.x           | $\fq$       |                                      | $x$-coordinate of first potential point (corresponding to add_state[0]) to add in Straus MSM round                                                                                       |
| msm_y1            | add_state[0].point.y           | $\fq$       |                                      | $y$-coordinate of first potential point (corresponding to add_state[0]) to add in Straus MSM round                                                                                       |
| msm_x2            | add_state[1].point.x           | $fq$        |                                      | $x$-coordinate of second potential point (corresponding to add_state[1]) to add in Straus MSM                                                                                            |
| msm_y2            | add_state[1].point.y           | $\fq$       |                                      | $y$-coordinate of second potential point (corresponding to add_state[1]) to add in Straus MSM                                                                                            |
| msm_x3            | add_state[2].point.x           | $\fq$       |                                      | x-coordinate of third potential point (corresponding to add_state[2]) to add in Straus MSM round                                                                                         |
| msm_y3            | add_state[2].point.y           | $\fq$       |                                      | y-coordinate of third potential point (corresponding to add_state[2]) to add in Straus MSM round                                                                                         |
| msm_x4            | add_state[3].point.x           | $\fq$       |                                      | x-coordinate of fourth potential point (corresponding to add_state[3]) to add in Straus MSM round                                                                                        |
| msm_y4            | add_state[3].point.y           | $\fq$       |                                      | y-coordinate of fourth potential point (corresponding to add_state[3]) to add in Straus MSM round                                                                                        |
| msm_add1          | add_state[0].add               | $\{0, 1\}$  |                                      | are we adding msm_x1/msm_y1 (resp. add_state[0]) into accumulator at current round?                                                                                                      |
| msm_add2          | add_state[1].add               | $\{0, 1\}$  |                                      | are we adding msm_x2/msm_y2 (resp. add_state[1]) into accumulator at current round?                                                                                                      |
| msm_add3          | add_state[2].add               | $\{0, 1\}$  |                                      | are we adding msm_x3/msm_y3 (resp. add_state[2]) into accumulator at current round?                                                                                                      |
| msm_add4          | add_state[3].add               | $\{0, 1\}$  |                                      | are we adding msm_x4/msm_y4 (resp. add_state[3]) into accumulator at current round?                                                                                                      |
| msm_slice1        | add_state[0].slice             | $[0, 15]$   |                                      | wNAF slice value (a.k.a. digit) for first point (corresponds to odd number in $\{-15, -13, \ldots, 15\}$ via the monotonic bijection)                                                    |
| msm_slice2        | add_state[1].slice             | $[0, 15]$   |                                      | wNAF slice value (a.k.a. digit) for second point                                                                                                                                         |
| msm_slice3        | add_state[2].slice             | $[0, 15]$   |                                      | wNAF slice value (a.k.a. digit) for third point                                                                                                                                          |
| msm_slice4        | add_state[3].slice             | $[0, 15]$   |                                      | wNAF slice value (a.k.a. digit) for fourth point                                                                                                                                         |
| msm_lambda1       | add_state[0].lambda            | $\fq$       |                                      | if add_state[0].add==1 (eqiv. if msm_add1 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_lambda2       | add_state[1].lambda            | $\fq$       |                                      | if add_state[1].add==1 (eqiv. if msm_add2 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_lambda3       | add_state[2].lambda            | $\fq$       |                                      | if add_state[2].add==1 (eqiv. if msm_add3 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_lambda4       | add_state[3].lambda            | $\fq$       |                                      | if add_state[3].add==1 (eqiv. if msm_add3 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_collision_x1  | add_state[0].collision_inverse | $\fq$       |                                      | if add_state[0].add == 1, the difference of the $x$ values of the accumulator and the point being added. used to ensure incomplete ecc addition exceptions not triggered if msm_add1 = 1 |
| msm_collision_x2  | add_state[1].collision_inverse | $\fq$       |                                      | if add_state[1].add == 1, the difference of the $x$ values of the accumulator and the point being added.                                                                                 |
| msm_collision_x3  | add_state[2].collision_inverse | $\fq$       |                                      | if add_state[2].add == 1, the difference of the $x$ values of the accumulator and the point being added.                                                                                 |
| msm_collision_x4  | add_state[3].collision_inverse | $\fq$       |                                      | if add_state[3].add == 1, the difference of the $x$ values of the accumulator and the point being added.                                                                                 |
| msm_accumulator_x | accumulator_x                  | $\fq$       |                                      | (accumulator_x, accumulator_y) = $A$ is the accumulated point                                                                                                                            |
| msm_accumulator_y | accumulator_y                  | $\fq$       |                                      | (accumulator_x, accumulator_y) = $A$ is the accumulated point                                                                                                                            |

### MSM algorithm and description

We have already given a high-level summary of the Straus algorithm. Let us get into the weeds!

The function signature is the following:

```
static std::tuple<std::vector<MSMRow>, std::array<std::vector<size_t>, 2>> compute_rows(
        const std::vector<MSM>& msms, const uint32_t total_number_of_muls, const size_t num_msm_rows)

```

In other words, `compute_rows` takes in a vector of MSMs (each of which is a vector of `ScalarMul`s), together with the total number of non-zero `mul` operations we compute and the (easy-to-compute) a priori size bound `num_msm_rows`, and returns a vector of `MSMRow`s and two vectors, which will represent our point-counts (i.e., will be fed into the lookup argument).

Before we get into the content, note that we may assume that no point is $\NeutralElt$ in any of the MSMs. Indeed, this is due to checks done by the Transcript Columns. However, it is in principle possible that some of the scalars are $0$; we do not force $\transcriptzonezero = 0 \Rightarrow \transcriptzone != 0$

$\newcommand{\msmpc}{{\mathrm{msm\_pc}}}$
$\newcommand{\msmsizeofmsm}{{\mathrm{msm\_size\_of\_msm}}}$
$\newcommand{\msmcount}{{\mathrm{msm\_count}}}$
$\newcommand{\msmround}{{\color{blue}\mathrm{msm\_round}}}$
$\newcommand{\msmtransition}{{\color{purple}\mathrm{msm\_transition}}}$
$\newcommand{\msmadd}{{\color{purple}\mathrm{msm\_add}}}$
$\newcommand{\msmdouble}{{\color{purple}\mathrm{msm\_double}}}$
$\newcommand{\msmskew}{{\color{purple}\mathrm{msm\_skew}}}$
$\newcommand{\msmxone}{{\mathrm{msm\_x1}}}$
$\newcommand{\msmyone}{{\mathrm{msm\_y1}}}$
$\newcommand{\msmxtwo}{{\mathrm{msm\_x2}}}$
$\newcommand{\msmytwo}{{\mathrm{msm\_y2}}}$
$\newcommand{\msmxthree}{{\mathrm{msm\_x3}}}$
$\newcommand{\msmythree}{{\mathrm{msm\_y3}}}$
$\newcommand{\msmxfour}{{\mathrm{msm\_x4}}}$
$\newcommand{\msmyfour}{{\mathrm{msm\_y4}}}$
$\newcommand{\msmaddone}{{\color{purple}\mathrm{msm\_add1}}}$
$\newcommand{\msmaddtwo}{{\color{purple}\mathrm{msm\_add2}}}$
$\newcommand{\msmaddthree}{{\color{purple}\mathrm{msm\_add3}}}$
$\newcommand{\msmaddfour}{{\color{purple}\mathrm{msm\_add4}}}$
$\newcommand{\msmsliceone}{{\color{teal}\mathrm{msm\_slice1}}}$
$\newcommand{\msmslicetwo}{{\color{teal}\mathrm{msm\_slice2}}}$
$\newcommand{\msmslicethree}{{\color{teal}\mathrm{msm\_slice3}}}$
$\newcommand{\msmslicefour}{{\color{teal}\mathrm{msm\_slice4}}}$
$\newcommand{\msmlambdaone}{{\mathrm{msm\_lambda1}}}$
$\newcommand{\msmlambdatwo}{{\mathrm{msm\_lambda2}}}$
$\newcommand{\msmlambdathree}{{\mathrm{msm\_lambda3}}}$
$\newcommand{\msmlambdafour}{{\mathrm{msm\_lambda4}}}$
$\newcommand{\msmcollisionxone}{{\mathrm{msm\_collision\_x1}}}$
$\newcommand{\msmcollisionxtwo}{{\mathrm{msm\_collision\_x2}}}$
$\newcommand{\msmcollisionxthree}{{\mathrm{msm\_collision\_x3}}}$
$\newcommand{\msmcollisionxfour}{{\mathrm{msm\_collision\_x4}}}$
$\newcommand{\msmaccumulatorx}{{\mathrm{msm\_accumulator\_x}}}$
$\newcommand{\msmaccumulatory}{{\mathrm{msm\_accumulator\_y}}}$

Each row (after the first row) in the MSM table will belong to one of the MSMs we are assigned to compute in `msms`. For an `msm` of size `m`, the number of rows that will be added in the MSM table is:

$$(\texttt{NUM-WNAF-DIGITS-PER-SCALAR + 1})\lceil \frac{m}{\texttt{ADDITIONS-PER-ROW}}\rceil + (\texttt{NUM-WNAF-DIGITS-PER-SCALAR} - 1) = 33\frac{m}{4} + 31.$$

There is one other quirk we should explicate before entering the algorithm. In general, the logic for affine elliptic curve addition can have cases: when the $x$ coordinates match up. (Doubling cannot have cases for points on our affine elliptic curve because there is no $\fq$-rational $2$-torsion.) Moreover, in general our logic must branch if either our base or the accumulator is $\NeutralElt$. As we have indicated several times above, for optimization, we _represent_ $\NeutralElt$ as $(0, 0)$ in the code. It is advantageous to avoid this branching logic. We do so by _relaxing completeness_. In particular, we start off the accumulator of every MSM with a fixed `offset_generator`. This is a fixed point of $E$ that we may consider pseudo-random (though it is fixed and indeed hardcoded). Then we decree that for our MSM to be valid, in the course of the Straus algorithm, whenever I accumulate $A\leftarrow A + P$, the $x$-coordinates of $A$ and $P$ differ. This condition of being valid may be witnessed by the prover providing the inverse of the difference of the $x$-coordinates every time it is necessary.

This indeed breaks completeness, inasmuch as there are valid `EccOpQueue`s which will not be able to be compiled into a valid execution trace. However, this is vanishingly unlikely, in the course of any normal operations.

Finally, we may describe the algorithm. We implicitly organize our data in the following type of table (as indicated in the [Straus Section](#straus)). Each row of our table corresponds to a scalar multiplication: the elements of the row are the wNAF digits (including the `skew` bit). In other words, the columns of our table correspond to wNAF digits. Our algorithm will proceed column by column, from most significant to least significant digit, processing one vertical chunk of four elements after another. To emphasize: this table syntactically encoding our MSM is _not_ what we refer to as the MSM table of the VM, which rather witnesses the correct execution of the MSM.

1. Set the first row of the MSM table (of our VM) to be 0.
2. Initialize lookup table read counts: `point_table_read_counts[0]` and `point_table_read_counts[1]` to track the positive and negative lookups corresponding to $nP$, where $n\in \{-15, -13, \ldots, 13, 15\}$. Each table will have size `total_number_of_muls * 8` (since `POINT_TABLE_SIZE/2 = 8`).
3. Compute the MSM row boundaries: for each MSM, fill out the indices of where it starts and the starting $\msmpc$. This requires a calculation of the number of rows required, which we come back to in the [next section](#msm-size).
4. First pass: populate `point_table_read_counts` based on `msm[point_idx].wnaf_digits[digit_idx]`. Update read counts based on skew as well.

We deviate from the witness generation algorithm here. In the code, in order to minimize the number of field divisions, we first compute in projective coordinates, then batch-normalize back to affine to fill in the values affine values. Here we just specify the values of the various columns in a more naive way.

5. Set the accumulator at the beginning of every `msm` to be `offset_generator`. (This allows us to avoid case-logic in EC addition.)
6. For `digit-position` (a.k.a. column of my syntactic MSM table) in $0..31$:

   1. Populate the rows of the VM's MSM table as follows.

      1. Check if the row corresponds to a new `msm`. If so, set $\msmtransition = 1$.
      2. Process the (no greater than) `ADDITIONS_PER_ROW` points per row:

         1. Get the up-until-now value of the accumulator and set into $(\msmaccumulatorx, \msmaccumulatory)$. For the first row of an MSM, this is `offset_generator`, for a non-first row of an MSM this involves processing the previous row of the MSM table.
         2. Set $\msmadd = 1$, $\msmdouble = 0$, and $\msmskew = 0$.
         3. Set the booleans $\msmaddone$, $\msmaddtwo$, $\msmaddthree$, and $\msmaddfour$ to the correct values (all should be one if we haven't yet exhausted the column, if we are at the end of a column and $m$ is not divisible by 4, only the first $m\text{ mod} 4$ should be turned on).
         4. For each point that is "on", record the following (which all correspond to members of `AddState`):
            1. the slice a.k.a. digit value. (This has values in $\{0,\ldots,15\}$ and corresponds to the elements $\{-15, -13, \ldots, 13, 15\}$.) These are filled in $\msmsliceone$, $\msmslicetwo$, $\msmslicethree$, and $\msmslicefour$.
            2. The precomputed value of the slice/digit times the corresponding base point. These are filled in $\msmxone$, $\msmyone$, $\msmxtwo$, $\msmytwo$, $\msmxthree$, $\msmythree$, and $\msmxfour$, $\msmyfour$. Note that, as we are proceeding vertically, the base points corresponding to $\msmsliceone$, $\msmslicetwo$, $\msmslicethree$, and $\msmslicefour$ may very well all be different.
            3. Auxiliary values needed to compute the sum of the accumulator and the points-to-be-added into the accumulator: in particular, the slope of the line between the (intermediate) accumulator and the point-to-be-added. These are contained in $\msmlambdaone$, $\msmlambdatwo$, $\msmlambdathree$, and $\msmlambdafour$. Here, there is a subtle point: we do not explicitly record the intermediate values of the accumulator in this row in our VM's MSM table, although $\msmlambdatwo$, $\msmlambdathree$, and $\msmlambdafour$ reflect these values. Indeed, if $Q_1 = (\msmxone, \msmyone)$, $Q_2 = (\msmxtwo, \msmytwo)$, and our accumulator is starting at $A$, then $\msmlambdaone$ is the slope between the line $A$ and $Q_1$, while $\msmlambdatwo$ is the slope between the line $A+Q_1$ and $Q_2$. However, $A + Q_1$ is _not_ explicitly recorded in our MSM table.
            4. For each point that is "on", fill in the following values $\msmcollisionxone$, $\msmcollisionxtwo$, $\msmcollisionxthree$, and $\msmcollisionxfour$. These are the differences in the $x$ values between the (intermediate) accumulator and the point-to-be-added. This witnesses/verifies the fact that we don't have edge-case logic for the addition. As with the $\lambda$ values, these reflect the intermediate values of the accumulator although that intermediate value is _not_ explicitly recorded in our MSM table.

      3. Process the 4 doublings, as long as we are not at the last wnaf digit. This involves adding a _single_ row to the MSM table.
         1. Set $\msmadd = 0$, $\msmdouble = 1$, and $\msmskew = 0$.
         2. Get the value of $\msmaccumulatorx$ and $\msmaccumulatory$ from the last row.
         3. The values: $\msmcount$, $\msmtransition$, $\msmsliceone$, $\msmslicetwo$, $\msmslicethree$, $\msmslicefour$, $\msmxone$, $\msmyone$, $\msmxtwo$, $\msmytwo$, $\msmxthree$, $\msmythree$, $\msmxfour$, $\msmyfour$, $\msmcollisionxone$, $\msmcollisionxtwo$, $\msmcollisionxthree$, and $\msmcollisionxfour$ are all set to $0$.
         4. We set $\msmlambdaone$, $\msmlambdatwo$, $\msmlambdathree$, and $\msmlambdafour$ correctly: they are each the slope of the line passing through the current _intermediate_ accumulator tangent to $E$. For instance, $\msmlambdaone$ is the slope of the line through $A$, $\msmlambdatwo$ is the slope through $2A$, etc.
      4. Process the skew digit in an analogous way to the processing of the additions.

### MSM size

Suppose we have an MSM of short scalars of size $m$. Then the number of rows we add to the MSM table of the VM is:

$$(\texttt{NUM-WNAF-DIGITS-PER-SCALAR + 1})\lceil \frac{m}{\texttt{ADDITIONS-PER-ROW}}\rceil + (\texttt{NUM-WNAF-DIGITS-PER-SCALAR} - 1) = 33\frac{m}{4} + 31.$$
Indeed, there are $\lceil \frac{m}{\texttt{ADDITIONS-PER-ROW}}\rceil$ `add`-rows per digit, and there are $\texttt{NUM-WNAF-DIGITS-PER-SCALAR + 1}$ digits per scalar (where the last digit is the `skew` digit). Finally, the last term comes from the doublings.

Note that in the regime where we have a few long MSMs, this is asymptotic to $8.25m$, which is comparable to the $8m$ we get from the precomputed columns. On the other hand, if we have many very short MSMs, the size of this table dominates what was produced by the precomputed columns.
