# ECCVM (ElliptiC Curve Virtual Machine) in Barretenberg

> **Warning:** This document is intended to provide an overview of the ECCVM in barretenberg. It is not a complete specification and does not cover all edge cases or optimizations. The source code should be consulted for a complete understanding of the implementation.

## Punchline

The ECCVM efficiently proves the correct execution of accumulated elliptic curve operations on the BN-254 curve. It does this by witnessing the correct execution into a table of numbers (in the same field as the base field of the elliptic curve) and applying polynomial constraints, multiset equality-checks, and lookup arguments.

## Notation

\f$\newcommand{\fq}{\mathbb{F}_q}\f$
\f$\newcommand{\fr}{\mathbb{F}_r}\f$
\f$\newcommand{\zr}{\mathbb{Z}/r\mathbb{Z}}\f$
\f$\newcommand{\zq}{\mathbb{Z}/q\mathbb{Z}}\f$
\f$\newcommand{\NeutralElt}{\mathcal{O}}\f$

- \f$\fq\f$ is the prime field of size \f$q = 21888242871839275222246405745257275088696311157297823662689037894645226208583\f$.
- \f$\fr\f$ is the prime field of size \f$r = 21888242871839275222246405745257275088548364400416034343698204186575808495617\f$.
- \f$E/\fq\f$ is the elliptic curve whose Weierstrass equation is \f$y^2 = x^3 + 3\f$. This is known as the _BN-254_ curve.
- The element \f$\NeutralElt\f$ refers to the neutral element of \f$E\f$, i.e., the point at infinity. We internally represent it in affine coordinates as \f$(0, 0)\f$ for efficiency, although \f$(0, 0)\f$ is not a point on the curve.
- \f$C/\fr\f$ is the elliptic curve whose Weierstrass equation is \f$y^2 = x^3 - 17\f$. This is known as the _Grumpkin_ curve.

We have the following facts:

- \f$2r>q>r\f$
- \f$C(\fr)\f$ is a cyclic group of order \f$q\f$, i.e., is isomorphic to \f$\zq\f$
- \f$E(\fq)\f$ is a cyclic group of order \f$r\f$, i.e., is isomorphic to \f$\zr\f$.

In general, \f$\zq\f$ and \f$\zr\f$ refer to the additive abelian groups; we use \f$\fq\f$ and \f$\fr\f$ when we require the multiplicative structure. We do not strictly abide by this convention (common in cryptography), but it helps disambiguate usage.

We also use the following constants:

- \f$w=\texttt{NUM-WNAF-DIGIT-BITS} = 4\f$
- \f$\texttt{NUM-SCALAR-BITS} = 128\f$
- \f$\texttt{NUM-WNAF-DIGITS-PER-SCALAR}=\texttt{NUM-SCALAR-BITS} / \texttt{NUM-WNAF-DIGIT-BITS} = 32\f$
- \f$\texttt{ADDITIONS-PER-ROW} = 4\f$

Finally, the terminology `pc` stands for _point-counter_. (In particular, it does _not_ stand for "program counter".)

## Bird's eye overview/motivation

In a nutshell, the ECCVM is a simple virtual machine to facilitate the verification of native elliptic curve computations. Given an `op_queue` of BN-254 operations, the ECCVM compiles the execution of these operations into an _execution trace representation_ over \f$\fq\f$ (the field of definition / base field of BN-254). This field is also the scalar field of Grumpkin.

In a bit more detail, the ECCVM is a compiler that takes a sequence of operations (in BN-254) and produces a table of numbers (in \f$\fq\f$), such that the correct evaluation of the sequence of operations precisely corresponds to polynomial constraints vanishing on the rows of this table. Moreover, these polynomial constraints are independent of the specific sequence of operations. As our tables of numbers have elements in \f$\fq\f$, the _native field_ of the circuit is \f$\fq\f$. When we prove these constraints, we use the Grumpkin curve \f$C\f$.

The core complication comes from the _efficient_ handling of scalar multiplications. Due to MSM optimizations, we effectively produce _three_ tables, where each table has its own set of multivariate polynomials, such that correct evaluation corresponds to those polynomials vanishing row-wise. These tables "communicate" via strict lookup arguments and multiset-equality checks.

Earlier [documentation](https://hackmd.io/@aztec-network/rJ5xhuCsn?type=view) exists. While it does not exactly match the current codebase, it is a helpful guide; this document is an updated explication.

## Op Queue

We first specify the allowable operations; the OpQueue is roughly a list of operations on a fixed elliptic curve, including a running accumulator which propagates from instruction to instruction. It may be seen as a finite state machine processing simple elliptic curve operations with a single memory register.

### Operations

At any moment we have an accumulated value \f$A\f$, and the potential operations are: `add`, `mul`, `eq`, `reset`, `eq_and_reset`. There are four selectors \f$q_{\text{add}}, q_{\text{mul}}, q_{\text{eq}}, q_{\text{reset}}\f$, so all operations except `eq_and_reset` correspond to a unique selector being on. Given an operation, we have an associated opcode value:

| `EccOpCode`    | Op Code Value                |
| -------------- | ---------------------------- |
| `add`          | \f$\texttt{1000} \equiv 8\f$ |
| `mul`          | \f$\texttt{0100} \equiv 4\f$ |
| `eq_and_reset` | \f$\texttt{0011} \equiv 3\f$ |
| `eq`           | \f$\texttt{0010} \equiv 2\f$ |
| `reset`        | \f$\texttt{0001} \equiv 1\f$ |

On the level of selectors,
\f[
\texttt{opcode_value}=8\,q_{\text{add}} + 4\,q_{\text{mul}} + 2\,q_{\text{eq}} + q_{\text{reset}}.
\f]

#### Description of operations

- `add` takes a point \f$P\f$ and updates \f$A \leftarrow A + P\f$.
- `mul` takes \f$P\f$ and \f$s \in \fr\f$ and updates \f$A \leftarrow A + sP\f$.
- `eq` takes \f$P\f$ and "checks" \f$A == P\f$.
- `reset` sets \f$A \leftarrow \NeutralElt\f$.
- `eq_and_reset` takes \f$P\f$, checks \f$A == P\f$, and then sets \f$A \leftarrow \NeutralElt\f$.

### Decomposing scalars

_Decomposing scalars_ is an important optimization for (multi)scalar multiplications, especially when many scalars are 128-bit.

Both \f$\fr\f$ and \f$\fq\f$ have primitive cube roots of unity (their orders are \f$\equiv 1 \pmod{3}\f$). Fix \f$\beta \in \fq\f$ a primitive cube root of unity. It induces an order-6 automorphism \f$\varphi\f$ of BN-254:
\f[
\varphi: (x,y) \mapsto (\beta x, -y).
\f]

As \f$E(\fq) \cong \zr\f$, and the natural map \f$\fr \rightarrow \mathrm{End}_{\mathrm{ab.gp}}(\zr)\f$ is an isomorphism, \f$\varphi\f$ corresponds to \f$\zeta \in \fr\f$ satisfying
\f[
\zeta^2 - \zeta + 1 = 0.
\f]
In particular, \f$\lambda := -\zeta\f$ is a cube root of unity in \f$\fr\f$ and satisfies \f$\lambda^2 + \lambda + 1 = 0\f$.

Given \f$s \in \zr\f$, we can write \f$s = z_1 - \lambda z_2 = z_1 + \zeta z_2\f$ with "small" \f$z_i\f$. Consider the lattice
\f$L := \ker\big( \mathbb{Z}^2 \to \zr\big)\f$, \f$(a,b)\mapsto a + \zeta b\f$. A fundamental domain around the origin lies inside a box with side length \f$B := \frac{\sqrt{3r}}{2} < 2^{128}\f$, hence \f$z_i\f$ fit in 128 bits. See `split_into_endomorphism_scalars` method in the field module for details.

### Column representation (a.k.a. the Input Trace)

An operation in the OpQueue may be entered into a table as follows:

| `op` | `X` | `Y` | `z_1` | `z_2` | `mul_scalar_full` |

Here, `op` is the value of the operation, \f$(X, Y)\f$ are the _affine_ coordinates of \f$P\f$, `mul_scalar_full` stands for "full scalar if the operation is `mul`" (so is an element of \f$\fr\f$), and `z_1` and `z_2` are a decomposition of `mul_scalar_full` as explained [above](#decomposing-scalars). In particular, `z_1` and `z_2` may each be represented by 128 bits.

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

In trying to build the execution trace of `ECCOpQueue`, the `mul` opcode is the only one that is non-trivial to evaluate, especially efficiently. One straightforward way to encode the `mul` operation is to break up the scalar into its bit representation and use a double-and-add procedure. We opt for the Straus MSM algorithm with \f$w=4\f$, which requires more precomputing but is significantly more efficient.

### High level summary of the operation of the VM

Before we dive into the Straus algorithm, here is the high-level organization. We go "row by row" in the `ECCOpQueue`; if the instruction is _not_ a `mul`, the `Transcript` table handles it. If it is a `mul` operation, it is _automatically_ part of an MSM (potentially one of length 1), and we defer evaluation to the Straus mechanism (which involves two separate tables: an `MSM` table and a `Precomputed` table). Eventually, at the _end_ of an MSM (i.e., if an op is a `mul` and the next op is not), the Transcript Columns will pick up the claimed evaluation from the MSM tables and continue along their merry way.

To do this in a moderately efficient manner is involved; we include logic for skipping computations when we can. For instance, if we have a `mul` operation with the base point \f$P=\NeutralElt\f$, then we will have a column that bears witness to this fact and skip the explicit scalar multiplication. Analogously, if the scalar is 0 in a `mul` operation, we also encode skipping the explicit scalar multiplication. This does not merely allow us to save work; it dramatically simplifies the actual MSM computations (especially recursively), by throwing out circumstances when there can be case logic. However, this, together with the delegation of work to multiple tables, itself required by the Straus algorithm, nonetheless results in somewhat complicated column structure.

However, at least some of this complexity is forced on us; in Barretenberg, we represent the \f$\NeutralElt\f$ of an elliptic curve in Weierstrass form as \f$(0, 0)\f$ for efficiency. (Note that \f$\NeutralElt\f$ is always chosen to be the point-at-infinity and in particular it has no "affine representation". Note further that \f$(0, 0)\f$ is indeed not a point on our elliptic curve!) These issues are worth keeping in mind when examining the ECCVM.

## Straus Algorithm for MSM

Recall, our high-level goal is to compute \f[\sum_{i=0}^{m-1} s_i P_i,\f] where \f$s_i\in \fr\f$ and \f$P_i\f$ are points on BN-254, i.e., we want to evaluate a multi-scalar multiplication of length \f$m\f$. We set \f$w=4\f$, as this is our main use-case. (In the code, this is represented as `static constexpr size_t NUM_WNAF_DIGIT_BITS = 4;`.) We have seen about that, setting \f$P'_i:=\varphi(P_i) = \lambda P_i\f$, we may write \f$s_iP_i = z_{i, 1}P_i - z_{i, 2}P'_i\f$, where \f$z_{i,j}\f$ has no more than 128 bits. We therefore assume that our scalars have no greater than 128 bits.

### wNAF

The first thing to specify is our windowed non-adjacent form (wNAF). This is an optimization for computing scalar multiplication. Moreover, the fact that we are working with an elliptic curve in Weierstrass form effectively halves the number of precomputes we need to perform.

**Warning**: our implementation is _not_ what is usually called wNAF. To avoid confusion, we simply avoid discussion on traditional (w)NAF.

Here is the key mathematical claim: for a 128-bit positive number \f$s\f$, we can uniquely write:
\f[s = \sum_{j=0}^{31} a_j 2^{4j} + \text{skew},\f]
where

- each \f$a_j\in \{-2^{4}+1, -2^{4}+3,\ldots, 2^{4}-1\}\f$
- \f$\text{skew}\in\{0, 1\}\f$.

In our implementation, we force \f$a_{31}>0\f$ to guarantee that \f$s\f$ is positive. Note that the exponent in the range of the digits \f$a_j\f$ is determined by \f$w=\texttt{NUM_WNAF_DIGIT_BITS} = 4\f$. The existence of the `skew` bit is to ensure that we can represent _even_ numbers.

The above decomposition is referred to in the code as the wNAF representation. Each \f$a_i\f$ is referred to either as a wNAF slice or digit.

We will come shortly to the algorithm, but as for the motivation: in our implementation, the neutral point of the group (i.e., point-at-infinity) poses some technical challenges for us. We work with the _affine_ representation of elliptic curve points, and \f$\NeutralElt\f$ certainly has no natural affine-coordiante representation. We choose to internally represent it as \f$(0, 0)\f$ (not a point on our curve!) and handle it with separate logic. It is therefore advantageous to avoid having to extraneously perform operations involving \f$\NeutralElt\f$, especially when we are implementing the recursive ECCVM verifier.

### Straus

Here is the problem: efficiently compute \f[\sum_i s_i P_i,\f] where the \f$s_i\f$ are 128-bit numbers and \f$P_i\f$ are points in BN-254. (Recall that we reduce to the case of 128-bit scalars by decomposing, as explained [above](#decomposing-scalars).)

To do this, we break up our computation into steps.

#### Precomputation

For each \f$s_i\f$, we expand it in wNAF form:\f$s_i = \sum_{j=0}^{31} a_{i, j} 2^{4j} + \text{skew}_i\f$.

For every \f$P_i\f$, precompute and store the multiples: \f[\{-15P_i, -13P_i, \ldots, 13P_i, 15P_i\}\f]
as well as \f$2P_i\f$. Note that, \f$E\f$ is represented in Weierstrass form, \f$nP\f$ and \f$-nP\f$ have the same affine \f$y\f$-coordinate and the \f$x\f$-coordinates differ by a sign.

#### Algorithm

Here are the static variables we need.

- `NUM_WNAF_DIGITS_PER_SCALAR=32`.
- `NUM_WNAF_DIGIT_BITS = 4`.
- `ADDITIONS_PER_ROW = 4`. This says that we can do 4 primitive EC additions per "row" of the virtual machine.

1. Set \f$A = \NeutralElt\f$ to be the neutral element of the group.
2. For \f$j\in [0, \ldots, 31]\f$, do:
   1. For \f$k\in [0,\ldots, \lceil \frac{m-1}{4}\rceil]\f$ (here, \f$k\f$ is the "row" in the VM), do:
      1. Set \f$A\leftarrow A + a_{4k, 31-j}P_{4k} + a_{4k+1, 31-j}P_{4k+1} + a_{4k+2, 31-j}P_{4k+2} + a_{4k+3, 31-j}P_{4k+3}\f$, where the individual scalar multiples are _looked up_ from the precomputed tables indicated in [precomputation](#precomputation). (No accumulations if the points \f$P_{4k+j}\f$ don't exist, which can potentially hold for \f$k=\lceil \frac{m-1}{4}\rceil\f$ and some \f$j\f$.)
   2. If \f$j\neq 31\f$, set \f$A\leftarrow 2^w A= 16 A\f$.
3. For \f$j = 32\f$, do:
   1. For \f$k\in [0,\ldots, \lceil \frac{m-1}{4}\rceil]\f$, do:
      1. Set \f$A\leftarrow A + \text{skew}_{4k}P_{4k} + \text{skew}_{4k+1}P_{4k+1} + \text{skew}_{4k+2}P_{4k+2} + \text{skew}_{4k+3}P_{4k+3}\f$.
4. Return \f$A\f$.

We picture this algorithm as follows. We build a table, the \f$i^{\text{th}}\f$ row of which is the wNAF expansion of \f$s_i\f$ in most-significant to least-significant order. This means that the first column corresponds to the most significant digit (\f$a_{-, 31}\f$).

We work column by column (this is the \f$j\f$-loop); for every vertical chunk of 4 elements, we accumulate (i.e., add to an accumulator \f$A\f$) looked up values corresponding to the digit/base-point pair. In the pseudo-code, we have an index \f$31-j\f$ because we want to proceed in decreasing order of significant digits. (Looking forward, a "row" of the MSM table in the ECCVM can handle 4 such additions.) We do this until we exhaust the column. We then multiply the accumulator by \f$16\f$ (as long as we are not at the last digit) and go to the next column. Finally, at the end we handle the `skew` digit.

## Tables

We have three tables that mediate the computation. As explained above, all of the computations are easy except for scalar multiplications. We process the computation and chunk what looks like scalar multiplications into MSMs. Here is the brief outline.

- `transcript_builder`. The transcript columns organize and process all of the computations _except for the scalar multiplications_. In particular, the Transcript Columns _do not bear witness_ to the intermediate computations necessary for MSMs. However, they still "access" the results of these computations.
- `precomputed_tables_builder`. The precomputed columns are: for every \f$P\f$ that occurs in an MSM (which was syntactically pulled out by the `transcript_builder`), we compute/store \f$\{P, 3P, \ldots, 15P, 2P\}\f$.
- `msm_builder` actually computes/constrains the MSMs via the Straus algorithm.

A final note: apart from three Lagrange columns, all columns are either 1. part of the input trace; or 2. witness columns committed to by the Prover.

In the following tables, each column has a defined "value range". If the range is not
\f$\fq\f$, the column must be range constrained, either with an explicit range check or implicitly through range constraints placed on other columns that define relations over the target column.

### Transcript Columns

\f$\newcommand{\transcriptmsminfinity}{{\mathrm{transcript\_msm\_infinity}}}\f$
\f$\newcommand{\transcriptaccumulatornotempty}{{\mathrm{transcript\_accumulator\_not\_empty}}}\f$
\f$\newcommand{\transcriptadd}{{\mathrm{transcript\_add}}}\f$
\f$\newcommand{\transcriptmul}{{\mathrm{transcript\_mul}}}\f$
\f$\newcommand{\transcripteq}{{\mathrm{transcript\_eq}}}\f$
\f$\newcommand{\transcriptresetaccumulator}{{\mathrm{transcript\_reset\_accumulator}}}\f$
\f$\newcommand{\transcriptmsmtransition}{{\mathrm{transcript\_msm\_transition}}}\f$
\f$\newcommand{\transcriptpc}{{\mathrm{transcript\_pc}}}\f$
\f$\newcommand{\transcriptmsmcount}{{\mathrm{transcript\_msm\_count}}}\f$
\f$\newcommand{\transcriptmsmcountzeroattransition}{{\mathrm{transcript\_msm\_count\_zero\_at\_transition}}}\f$
\f$\newcommand{\transcriptpx}{{\mathrm{transcript\_Px}}}\f$
\f$\newcommand{\transcriptpy}{{\mathrm{transcript\_Py}}}\f$
\f$\newcommand{\transcriptbaseinfinity}{{\mathrm{transcript\_base\_infinity}}}\f$
\f$\newcommand{\transcriptzone}{{\mathrm{transcript\_z1}}}\f$
\f$\newcommand{\transcriptztwo}{{\mathrm{transcript\_z2}}}\f$
\f$\newcommand{\transcriptzonezero}{{\mathrm{transcript\_z1zero}}}\f$
\f$\newcommand{\transcriptztwozero}{{\mathrm{transcript\_z2zero}}}\f$
\f$\newcommand{\transcriptop}{{\mathrm{transcript\_op}}}\f$
\f$\newcommand{\transcriptaccumulatorx}{{\mathrm{transcript\_accumulator\_x}}}\f$
\f$\newcommand{\transcriptaccumulatory}{{\mathrm{transcript\_accumulator\_y}}}\f$
\f$\newcommand{\transcriptmsmx}{{\mathrm{transcript\_msm\_x}}}\f$
\f$\newcommand{\transcriptmsmy}{{\mathrm{transcript\_msm\_y}}}\f$
\f$\newcommand{\transcriptmsmintermediatex}{{\mathrm{transcript\_msm\_intermediate\_x}}}\f$
\f$\newcommand{\transcriptmsmintermediatey}{{\mathrm{transcript\_msm\_intermediate\_y}}}\f$
\f$\newcommand{\transcriptaddxequal}{{\mathrm{transcript\_add\_x\_equal}}}\f$
\f$\newcommand{\transcriptaddyequal}{{\mathrm{transcript\_add\_y\_equal}}}\f$
\f$\newcommand{\transcriptbasexinverse}{{\mathrm{transcript\_base\_x\_inverse}}}\f$
\f$\newcommand{\transcriptbaseyinverse}{{\mathrm{transcript\_base\_y\_inverse}}}\f$
\f$\newcommand{\transcriptaddlambda}{{\mathrm{transcript\_add\_lambda}}}\f$
\f$\newcommand{\transcriptmsmxinverse}{{\mathrm{transcript\_msm\_x\_inverse}}}\f$
\f$\newcommand{\transcriptmsmcountattransitioninverse}{{\mathrm{transcript\_msm\_count\_at\_transition\_inverse}}}\f$

| column name                                  | builder name                    | value range       | computation                                                                                                                          | description                                                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|                                              |                                 |                   | **Populated in the first loop**                                                                                                      |                                                                                                                                                                                                                        |
| \f$\transcriptmsminfinity\f$                 | transcript_msm_infinity         | \f$\{0, 1 \}\f$   | `msm_output.is_point_at_infinity();`                                                                                                 | are we at the end of an MSM _and_ is the output the point at infinity?                                                                                                                                                 |
| \f$\transcriptaccumulatornotempty\f$         | accumulator_not_empty           | \f$\{0, 1 \}\f$   | `row.accumulator_not_empty = !state.is_accumulator_empty;`, `final_row.accumulator_not_empty = !updated_state.is_accumulator_empty;` | not(is the accumulator either empty or point-at-infinity?)                                                                                                                                                             |
| \f$\transcriptadd\f$                         | q_add                           | \f$\{0, 1 \}\f$   |                                                                                                                                      | is opcode                                                                                                                                                                                                              |
| \f$\transcriptmul\f$                         | q_mul                           | \f$\{0, 1 \}\f$   |                                                                                                                                      | is opcode                                                                                                                                                                                                              |
| \f$\transcripteq\f$                          | q_eq                            | \f$\{0, 1\}\f$    |                                                                                                                                      | is opcode                                                                                                                                                                                                              |
| \f$\transcriptresetaccumulator\f$            | q_reset_accumulator             | \f$\{0, 1 \}\f$   |                                                                                                                                      | does opcode reset accumulator?                                                                                                                                                                                         |
| \f$\transcriptmsmtransition\f$               | msm_transition                  | \f$\{0, 1\}\f$    | `msm_transition = is_mul && next_not_msm && (state.count + num_muls > 0);`                                                           | are we at the end of an msm? i.e., is current transcript row the final `mul` opcode of a MSM                                                                                                                           |
| \f$\transcriptpc\f$                          | pc                              | \f$\fq\f$         | `updated_state.pc = state.pc - num_muls;`                                                                                            | _decreasing_ point counter. Only takes into count `mul` operations, not `add` operations.                                                                                                                              |
| \f$\transcriptmsmcount\f$                    | msm_count                       | \f$\fq\f$         | `updated_state.count = current_ongoing_msm ? state.count + num_muls : 0;`                                                            | Number of muls so far in the _current_ MSM (NOT INCLUDING the current step)                                                                                                                                            |
| \f$\transcriptmsmcountzeroattransition\f$    | msm_count_zero_at_transition    | \f$\{0, 1\}\f$    | `((state.count + num_muls) == 0) && entry.op_code.mul && next_not_msm;`                                                              | is the number of scalar muls we have completed at the end of our "MSM block" zero? (note that from the definition, if this variable is non-zero, then `msm_transition == 0`.)                                          |
| \f$\transcriptpx\f$                          | base_x                          | \f$\fq\f$         |                                                                                                                                      | (input trace) \f$x\f$-coordinate of base point \f$P\f$                                                                                                                                                                 |
| \f$\transcriptpy\f$                          | base_y                          | \f$\fq\f$         |                                                                                                                                      | (input trace) \f$y\f$-coordinate of base point \f$P\f$                                                                                                                                                                 |
| \f$\transcriptbaseinfinity\f$                | base_infinity                   | \f$\{0, 1\}\f$    |                                                                                                                                      | is \f$P=\NeutralElt\f$?                                                                                                                                                                                                |
| \f$\transcriptzone\f$                        | z1                              | \f$[0,2^{128})\f$ |                                                                                                                                      | (input trace) first part of decomposed scalar                                                                                                                                                                          |
| \f$\transcriptztwo\f$                        | z2                              | \f$[0,2^{128})\f$ |                                                                                                                                      | (input trace) second part of decomposed scalar                                                                                                                                                                         |
| \f$\transcriptzonezero\f$                    | z1_zero                         | \f$\{0, 1\}\f$    |                                                                                                                                      | is z1 zero?                                                                                                                                                                                                            |
| \f$\transcriptztwozero\f$                    | z2_zero                         | \f$\{0, 1\}\f$    |                                                                                                                                      | is z2 zero?                                                                                                                                                                                                            |
| \f$\transcriptop\f$                          | op_code                         | \f$\in \fq\f$     | `entry.op_code.value();`                                                                                                             | 8 `q_add` + 4 `q_mul` + 2 `q_eq` + `q_reset`                                                                                                                                                                           |
|                                              |                                 |                   | **Populated after converting from projective to affine coordinates**                                                                 |                                                                                                                                                                                                                        |
| \f$\transcriptaccumulatorx\f$                | accumulator_x                   | \f$\fq\f$         |                                                                                                                                      | x-coordinate of accumulator \f$A\f$                                                                                                                                                                                    |
| \f$\transcriptaccumulatory\f$                | accumulator_y                   | \f$\fq\f$         |                                                                                                                                      | y-coordinate of accumulator \f$A\f$                                                                                                                                                                                    |
| \f$\transcriptmsmx\f$                        | msm_output_x                    | \f$\fq\f$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) + `offset_generator()` = `(msm_output_x, msm_output_y)`, else 0                                                                                                        |
| \f$\transcriptmsmy\f$                        | msm_output_y                    | \f$\fq\f$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) + `offset_generator()` = `(msm_output_x, msm_output_y)`, else 0                                                                                                        |
| \f$\transcriptmsmintermediatex\f$            | transcript_msm_intermediate_x   | \f$\fq\f$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) = `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`, else 0                                                                                             |
| \f$\transcriptmsmintermediatey\f$            | transcript_msm_intermediate_y   | \f$\fq\f$         |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) = `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`, else 0                                                                                             |
| \f$\transcriptaddxequal\f$                   | transcript_add_x_equal          | \f$\{0, 1\}\f$    | `(vm_x == accumulator_x) or (vm_infinity && accumulator_infinity);`                                                                  | do the accumulator and the point we are adding have the same \f$x\f$-value? (here, the two point we are adding is either part of an `add` instruction or the output of an MSM). 0 if we are not accumulating anything. |
| \f$\transcriptaddyequal\f$                   | transcript_add_y_equal          | \f$\{0, 1\}\f$    | `(vm_y == accumulator_y) or (vm_infinity && accumulator_infinity);`                                                                  | do the accumulator and the point we are adding have the same \f$y\f$-value? 0 if we are not accumulating anything.                                                                                                     |
| \f$\transcriptbasexinverse\f$                | base_x_inverse                  | \f$\fq\f$         |                                                                                                                                      | if adding a point to the accumulator and the \f$x\f$ values are not equal, the inverse of the difference of the \f$x\f$ values. (witnesses `transcript_add_x_equal == 0`                                               |
| \f$\transcriptbaseyinverse\f$                | base_y_inverse                  | \f$\fq\f$         |                                                                                                                                      | if adding a point to the accumulator and the \f$y\f$ values are not equal, the inverse of the difference of the \f$y\f$ values. (witnesses `transcript_add_y_equal == 0`                                               |
| \f$\transcriptaddlambda\f$                   | transcript_add_lambda           | \f$\fq\f$         |                                                                                                                                      | if adding a point into the accumulator, contains the lambda gradient: the slope of the line between \f$A\f$ and \f$P\f$                                                                                                |
| \f$\transcriptmsmxinverse\f$                 | transcript_msm_x_inverse        | \f$\fq\f$         |                                                                                                                                      | used to validate transcript_msm_infinity correct; if the former is zero, this is the inverse of the \f$x\f$ coordinate of the (non-shifted) output of the MSM                                                          |
| \f$\transcriptmsmcountattransitioninverse\f$ | msm_count_at_transition_inverse | \f$\fq\f$         |                                                                                                                                      | used to validate transcript_msm_count_zero_at_transition                                                                                                                                                               |

### Transcript description and algorithm

In the above table, we have a reference what the transcript columns are. Here, we provide a natural-language summary of witness-generation, which in turn directly implies what the constraints should look like. Some of the apparent complexity comes from the fact that, for efficiency, we do operations in _projective coordinates_ and then normalize them all at the end. (This requires fewer field-inversions.)

We start our top row with \f$\transcriptmsmcount = 0\f$ and \f$\transcriptaccumulatornotempty = 0\f$. This corresponds to saying "there are no active multiplications in our MSM" and "the accumulator is \f$\NeutralElt\f$".

We process each `op`.

If the `op` is an `add`, we process the addition as follows. We have an accumulated value \f$A\f$ and a point \f$P\f$ to add. If \f$\transcriptbaseinfinity = 1\f$, we don't need to do anything: \f$P=\NeutralElt\f$. Similarly, if \f$\transcriptaccumulatornotempty = 0\f$, then we just (potentially) need to change \f$\transcriptaccumulatornotempty\f$, \f$\transcriptaccumulatorx\f$ and \f$\transcriptaccumulatory\f$. Otherwise, we need to check \f$\transcriptaddxequal\f$: the formula for point addition requires dividing by \f$\Delta x\f$, and in particular is not well-constrained either when adding points that are negative of each other or adding the same point to itself. (These two cases may be easily distinguished by examining \f$\transcriptaddyequal\f$). If we are _not_ in this case, we need the help of of \f$\transcriptaddlambda\f$, which is the slope between the points \f$P\f$ and \f$A\f$. (This slope will happily not be \f$\infty\f$, as we have ruled out the only occasions it had to be.)

The value \f$A\leftarrow A + P\f$ will of course involve different \f$\transcriptaccumulatorx\f$ and \f$\transcriptaccumulatory\f$, but may also cause \f$\transcriptaccumulatornotempty\f$ to flip.

We emphasize: we _do not_ modify \f$\transcriptpc\f$ in this case. Indeed, that variable is only modified based on the number of small scalar `mul`s we are doing.

If the `op` is `eq`, we process the op as follows. We have an accumulated value \f$A\f$ and a point \f$P\f$. Due to our non-uniform representation of \f$\NeutralElt\f$, we must break up into cases.

- Both are \f$\NeutralElt\f$ (i.e., \f$\transcriptaccumulatornotempty = 0\f$ and \f$\transcriptbaseinfinity=1\f$). Then accept!
- Neither is equal to \f$\NeutralElt\f$. Then we linearly compare \f$\transcriptaccumulatorx-\transcriptpx\f$ and \f$\transcriptaccumulatory-\transcriptpy\f$ and accept if both are \f$0\f$.
- Exactly one is equal to \f$\NeutralElt\f$. Then reject!

If our `op` is `eq_reset`, we do the same as for `eq`, but we also set \f$\transcriptaccumulatornotempty\leftarrow 0\f$.

If our `op` is a `mul`, with scalars `z1` and `z2`, the situation is more complicated. Now we have to update auxiliary wires. As explained, _every_ `mul` operation is understood to be part of an MSM.

- \f$\transcriptmsmcount\f$ counts the number of active short-scalar multiplications _up to and not including_ the current `mul` op. The value of this column at the _next_ row increments by \f$2 - \transcriptzonezero - \transcriptztwozero\f$.
- In other words, we simply avoid (our deferred) computations if \f$\transcriptzonezero = 1\f$ and/or \f$\transcriptztwozero = 1\f$.
- Similarly, \f$\transcriptpc\f$ _decrements_ by \f$2 - \transcriptzonezero - \transcriptztwozero\f$. We use a decreasing point counter (only counting short `mul`s) for efficiency reasons, as it allows for cheaper commitments.
- If the next `op` is not a `mul`, and the total number of active `mul` operations (which is \f$\transcriptmsmcount + (2 - \transcriptzonezero - \transcriptztwozero)\f$) is non-zero, set the \f$\transcriptmsmtransition = 1\f$. Else, set \f$\transcriptmsmcountzeroattransition = 1\f$. Either way, the current `mul` then represents the end of an MSM. This is where \f$\transcriptmsmcountattransitioninverse\f$ is used.
- If \f$\transcriptmsmtransition = 0\f$, then \f$\transcriptmsmx\f$, \f$\transcriptmsmy\f$, \f$\transcriptmsmintermediatex\f$, and \f$\transcriptmsmintermediatey\f$ are all \f$0\f$. (In particular, this holds when we are in the middle of an MSM.) Otherwise, we call \f$\transcriptmsmx\f$ and \f$\transcriptmsmy\f$ from the multiset argument, i.e., from the MSM table. Then the values of \f$\transcriptmsmintermediatex\f$ and \f$\transcriptmsmintermediatey\f$ are obtained by subtracting off the `OFFSET`.

#### Transcript size

The size of the _non-zero_ part of the table is the length of the `OpQueue` + 1 (we have shiftable columns). We have organized our wire values so that zero-padding is compatible with the polynomial constraints. (See e.g. the _decreasing_ point counter.)

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

As discussed in [Decomposing Scalars](#decomposing-scalars), WLOG our scalars have 128 bits and we may expand them in \f$w=4\f$ [wNAF](#wnaf):

\f[s = \sum_{j=0}^{31} a_j 2^{4j} + \text{skew},\f]
where

- each \f$a_j\in \{-2^{4}+1, -2^{4}+3,\ldots, 2^{4}-1\}\f$
- \f$\text{skew}\in\{0, 1\}\f$.

Given a wNAF digit \f$\in \{-15, -13, \ldots, 15\}\f$, we \f$\text{compress}\f$ it via the map:
\f[\text{compress}\colon d\mapsto \frac{d+15}{2},\f]
which is of course a bijection \f$\{-15, -13, \ldots, 15\}\rightarrow \{0,\ldots, 15\}\f$. (This compression is helpful for indexing later: looking forward, the values \f$[-15P, -13P, \ldots, 15P]\f$ will be stored in an array, so if we want to looking up \f$kP\f$, where \f$k\in \{-15, -13, \ldots, 15\}\f$, we can go to the \f$\text{compress}(k)\f$ index of our array associated to \f$P\f$.)

\f$\newcommand{\precomputesonehi}{{\mathrm{precompute\_s1hi}}}\f$
\f$\newcommand{\precomputesonelo}{{\mathrm{precompute\_s1lo}}}\f$
\f$\newcommand{\precomputestwohi}{{\mathrm{precompute\_s2hi}}}\f$
\f$\newcommand{\precomputestwolo}{{\mathrm{precompute\_s2lo}}}\f$
\f$\newcommand{\precomputesthreehi}{{\mathrm{precompute\_s3hi}}}\f$
\f$\newcommand{\precomputesthreelo}{{\mathrm{precompute\_s3lo}}}\f$
\f$\newcommand{\precomputesfourhi}{{\mathrm{precompute\_s4hi}}}\f$
\f$\newcommand{\precomputesfourlo}{{\mathrm{precompute\_s4lo}}}\f$
\f$\newcommand{\precomputeskew}{{\mathrm{precompute\_skew}}}\f$
\f$\newcommand{\precomputepointtransition}{{\mathrm{precompute\_point\_transition}}}\f$
\f$\newcommand{\precomputepc}{{\mathrm{precompute\_pc}}}\f$
\f$\newcommand{\precomputeround}{{\mathrm{precompute\_round}}}\f$
\f$\newcommand{\precomputescalarsum}{{\mathrm{precompute\_scalar\_sum}}}\f$
\f$\newcommand{\precomputetx}{{\mathrm{precompute\_tx}}}\f$
\f$\newcommand{\precomputety}{{\mathrm{precompute\_ty}}}\f$
\f$\newcommand{\precomputedx}{{\mathrm{precompute\_dx}}}\f$
\f$\newcommand{\precomputedy}{{\mathrm{precompute\_dy}}}\f$
\f$\newcommand{\preselect}{{\mathrm{precompute\_select}}}\f$

The following is one row in the Precomputed table; there are `NUM_WNAF_DIGITS_PER_SCALAR / WNAF_DIGITS_PER_ROW == 32/4 = 8` rows. The row index is `i`. (This number is is also witnessed as `round`.)
| column name | builder name | value range | computation | description |
| ----------- | ---------------------- | ----------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| \f$\precomputesonehi\f$ | s1 | \f$[0, 4)\f$ | | first two bits of \f$\text{compress}(a_{31 - 4i})\f$ |
| \f$\precomputesonelo\f$ | s2 | \f$[0, 4)\f$ | | second two bits of \f$\text{compress}(a_{31 - 4i})\f$ |
| \f$\precomputestwohi\f$ | s3 | \f$[0, 4)\f$ | | first two bits of \f$\text{compress}(a_{31 - (4i + 1)})\f$ |
| \f$\precomputestwolo\f$ | s4 | \f$[0, 4)\f$ | | second two bits of \f$\text{compress}(a_{31 - (4i + 1)})\f$ |
| \f$\precomputesthreehi\f$ | s5 | \f$[0, 4)\f$ | | first two bits of \f$\text{compress}(a_{31 - (4i + 2)})\f$ |
| \f$\precomputesthreelo\f$ | s6 | \f$[0, 4)\f$ | | second two bits of \f$\text{compress}(a_{31 - (4i + 2)})\f$ |
| \f$\precomputesfourhi\f$ | s7 | \f$[0, 4)\f$ | | first two bits of \f$\text{compress}(a_{31 - (4i + 3)})\f$ |
| \f$\precomputesfourlo\f$ | s8 | \f$[0, 4)\f$ | | second two bits of \f$\text{compress}(a_{31 - (4i + 3)})\f$ |
| \f$\precomputeskew\f$ | skew | \f$\{0,1\}\f$ | | skew bit |
| \f$\precomputepointtransition\f$ | point_transition | \f$\{0,1\}\f$ | | are we at the last row corresponding to this scalar? |
| \f$\precomputepc\f$ | pc | \f$\fq\f$ | | value of the point counter of this EC operation |
| \f$\precomputeround\f$ | round | \f$\fq\f$ | | "row" of the computation, i.e., `i`. |
| \f$\precomputescalarsum\f$ | scalar_sum | \f$\fq\f$ | | sum up-to-now of the digits |
| \f$\precomputetx\f$, \f$\precomputety\f$ | precompute_accumulator | \f$E(\fq)\subset \fq\times \fq\f$ | | \f$(15-2i)P\f$ |
| \f$\precomputedx\f$, \f$\precomputedy\f$ | precompute_double | \f$E(\fq)\subset \fq\times \fq\f$ | | \f$2P\f$ |
| \f$\preselect\f$ | | \f$\{0,1\}\f$ | | if 1, evaluate Straus precomputation algorithm at current row |

### Precomputed Description and Algorithm

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

Note that, with respect to the decomposition in [wnaf](#wnaf), `wnaf_digits[i]`= \f$a_{31-i}\f$. Indeed, the order of the array `wnaf_digits` is from highest-order to lowest-order.

Given a `ScalarMul`, it is easy to construct the 8 rows of the Precomputed Table. As explained, `WNAF_DIGITS_PER_ROW = 4`; hence the `NUM_WNAF_DIGITS_PER_SCALAR = 32` digits in may be broken up into 8 rows, where each row corresponds to 4 wNAF digits, each of which is in \f$\{-15, -13, \ldots, 13, 15\}\f$.

1. For \f$i = 0 .. 7\f$

   1. For each of the 4 digits in the row: `wnaf_digits[4i]`, `wnaf_digits[4i+1]`, `wnaf_digits[4i+2]`, and `wnaf_digits[4i+3]`, `compress` from \f$\{-15, -13, \ldots, 13, 15\}\rightarrow \{0,\ldots 15\}\f$ via the monotonic map \f$z\mapsto \frac{z+15}{2}\f$. Then our compressed digits are in the latter range.
   2. extract the first and last pair of bits and fill in order in corresponding parts of the table: \f$\precomputesonehi\f$, \f$\precomputesonelo\f$, \f$\precomputestwohi\f$, \f$\precomputestwolo\f$, \f$\precomputesthreehi\f$, \f$\precomputesthreelo\f$, \f$\precomputesfourhi\f$, \f$\precomputesfourlo\f$ correspond to the 2-bit decompositions of the compressed wNAF digits.
   3. The value \f$\precomputepointtransition\f$ is set to 1 if this is the last row (i.e., `i == 7`) for the current scalar, else 0. This tracks if the next row in the table corresponds to a new `ScalarMul`.
   4. The value \f$\precomputepc\f$ is copied from the corresponding `ScalarMul.pc`.
   5. The value \f$\precomputeround\f$ is set to the row index `i`.
   6. The value \f$\precomputescalarsum\f$ accumulates the _scalar reconstruction_: \f$\displaystyle \sum_{j=0}^{4i+3} a_{31-j} \cdot 2^{4j}\f$. (Here, our current row is \f$i\f$.) In other words: at row \f$i\f$, we implicit consider the string of digits `wnaf_digits[0]`, ..., `wnaf_digits[4i+3]`; \f$\precomputescalarsum\f$ is precisely the value of the \f$4i\f$-digit number corresponding to this string of digits.
   7. The value \f$(\precomputetx, \precomputety)\f$ stores the precomputed point \f$(15-2i)P\f$. (Note that this reflects a coincidence: the number of rows (per scalar multiplication) is same as the number of odd multiples of \f$P\f$ that we need to store.)
   8. The value \f$(\precomputedx, \precomputedy)\f$ stores \f$2P\f$. (In particular, \f$2P\f$ is stored on all \f$8\f$ rows coming from a given `ScalarMul`.)

The constraints are straightforward.

- We must range constrain the \f$\precomputesonehi\f$, \f$\precomputesonelo\f$, \f$\precomputestwohi\f$, \f$\precomputestwolo\f$, \f$\precomputesthreehi\f$, \f$\precomputesthreelo\f$, \f$\precomputesfourhi\f$, \f$\precomputesfourlo\f$. We do this via the polynomial \f$((x-1)^2 - 1)((x-2)^2-1)\f$, a quartic constraint.
- We constrain that \f$\precomputescalarsum\f$ is updated correctly at each row.
- When \f$\precomputepointtransition = 1\f$, when we constrain that original `scalar` is \f$\precomputescalarsum - \precomputeskew\f$.
- We constrain the elliptic curve values. Note that we may assume that \f$P\neq \NeutralElt\f$; indeed, we only populate this table when we are doing non-trivial scalar multiplications. It follows that \f$nP\neq \NeutralElt\f$ for \f$0<n< r\f$, as \f$r\f$ is prime. This means that the following constraints have _no special case analysis_:

  - if \f$\precomputepointtransition = 1\f$, constrain \f$2P = (\precomputedx, \precomputedy)\f$
  - if \f$\precomputepointtransition = 0\f$, constrain \f$(\textbf{shift}(\precomputedx), \textbf{shift}(\precomputedy)) = (\precomputedx, \precomputedy)\f$. (Here, \f$\textbf{shift}\f$ means "the next value of the column".)
  - if \f$\precomputepointtransition = 0\f$, constrain \f[(\textbf{shift}(\precomputetx), \textbf{shift}(\precomputety)) = (\precomputedx, \precomputedy) + (\precomputetx, \precomputety),\f]where the latter addition of course happens on \f$E\f$.

- We emphasize that these EC constraints will only be turned on after the first row, as these values have no _neutral_ value that we can use for the first row (especially as it is critical that they are never \f$\NeutralElt\f$).
- We constrain \f$\precomputeround\f$ as follows. (Note that it _is not_ naively range-constrained.)
  - If \f$\precomputepointtransition = 1\f$, then set \f$\precomputeround = 7\f$ and \f$\textbf{shift}(\precomputeround) = 0\f$. (We are at the end of this block of precomputes for our `ScalarMul`), so if the next block is to be well-formed, the next round element better be \f$0\f$. Note that this is compatible with zero-padding.
  - If \f$\precomputepointtransition = 0\f$, set \f$\textbf{shift}(\precomputeround) - \precomputeround = 1\f$.

### Precomputed Size

For every _non-trivial_ short scalar `mul`, we fill in \f$8\f$ non-trivial rows to the precomputed table. Here, non-trivial means: \f$P\neq \NeutralElt\f$ and \f$z\neq 0\f$, where \f$z\f$ is the short (128-bit) scalar we are multiplying by. This means that for \f$m\f$ (non-trivial) short scalar `mul` operations, we add \f$8m\f$ rows to the precomputed table.

### MSM columns

This table is the most algorithmically involved.

```
struct alignas(64) MSMRow {
        uint32_t pc = 0; // decreasing point-counter, over all half-length (128 bit) scalar muls used to compute
                         // the required MSMs. however, this value is _constant_ on a given MSM and more precisely
                         //  refers to the number of half-length scalar muls completed up until we have started
                         // the current MSM.
        uint32_t msm_size = 0;  // the number of points in the current MSM. (this is _constant_ on MSM blocks.)
        uint32_t msm_count = 0; // number of multiplications processed so far (not including this row) in current MSM
                                // round (a.k.a. wNAF digit slot). this specifically refers to the number of wNAF-digit
                                // * point scalar products we have looked up and accumulated.
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

\f$\newcommand{\msmpc}{{\mathrm{msm\_pc}}}\f$
\f$\newcommand{\msmsizeofmsm}{{\mathrm{msm\_size\_of\_msm}}}\f$
\f$\newcommand{\msmcount}{{\mathrm{msm\_count}}}\f$
\f$\newcommand{\msmround}{{\mathrm{msm\_round}}}\f$
\f$\newcommand{\msmtransition}{{\mathrm{msm\_transition}}}\f$
\f$\newcommand{\msmadd}{{\mathrm{msm\_add}}}\f$
\f$\newcommand{\msmdouble}{{\mathrm{msm\_double}}}\f$
\f$\newcommand{\msmskew}{{\mathrm{msm\_skew}}}\f$
\f$\newcommand{\msmxone}{{\mathrm{msm\_x1}}}\f$
\f$\newcommand{\msmyone}{{\mathrm{msm\_y1}}}\f$
\f$\newcommand{\msmxtwo}{{\mathrm{msm\_x2}}}\f$
\f$\newcommand{\msmytwo}{{\mathrm{msm\_y2}}}\f$
\f$\newcommand{\msmxthree}{{\mathrm{msm\_x3}}}\f$
\f$\newcommand{\msmythree}{{\mathrm{msm\_y3}}}\f$
\f$\newcommand{\msmxfour}{{\mathrm{msm\_x4}}}\f$
\f$\newcommand{\msmyfour}{{\mathrm{msm\_y4}}}\f$
\f$\newcommand{\msmaddone}{{\mathrm{msm\_add1}}}\f$
\f$\newcommand{\msmaddtwo}{{\mathrm{msm\_add2}}}\f$
\f$\newcommand{\msmaddthree}{{\mathrm{msm\_add3}}}\f$
\f$\newcommand{\msmaddfour}{{\mathrm{msm\_add4}}}\f$
\f$\newcommand{\msmsliceone}{{\mathrm{msm\_slice1}}}\f$
\f$\newcommand{\msmslicetwo}{{\mathrm{msm\_slice2}}}\f$
\f$\newcommand{\msmslicethree}{{\mathrm{msm\_slice3}}}\f$
\f$\newcommand{\msmslicefour}{{\mathrm{msm\_slice4}}}\f$
\f$\newcommand{\msmlambdaone}{{\mathrm{msm\_lambda1}}}\f$
\f$\newcommand{\msmlambdatwo}{{\mathrm{msm\_lambda2}}}\f$
\f$\newcommand{\msmlambdathree}{{\mathrm{msm\_lambda3}}}\f$
\f$\newcommand{\msmlambdafour}{{\mathrm{msm\_lambda4}}}\f$
\f$\newcommand{\msmcollisionxone}{{\mathrm{msm\_collision\_x1}}}\f$
\f$\newcommand{\msmcollisionxtwo}{{\mathrm{msm\_collision\_x2}}}\f$
\f$\newcommand{\msmcollisionxthree}{{\mathrm{msm\_collision\_x3}}}\f$
\f$\newcommand{\msmcollisionxfour}{{\mathrm{msm\_collision\_x4}}}\f$
\f$\newcommand{\msmaccumulatorx}{{\mathrm{msm\_accumulator\_x}}}\f$
\f$\newcommand{\msmaccumulatory}{{\mathrm{msm\_accumulator\_y}}}\f$

| column name               | builder name                   | value range    | computation                                      | description                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------ | -------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| \f$\msmpc\f$              | pc                             | \f$\fq\f$      |                                                  | counter over all half-length (128 bit) scalar muls used to compute the required MSMs. constant on a given MSM, refers more precisely to the number of _completed_ scalar muls up until the current MSM. in particular, this skips values, unlike `transcript_pc`. |
| \f$\msmsizeofmsm\f$       | msm_size                       | \f$\fq\f$      |                                                  | the number of points that will be scaled and summed                                                                                                                                                                                                               |
| \f$\msmcount\f$           | msm_count                      | \f$\fq\f$      | `row.msm_count = static_cast<uint32_t>(offset);` | number of wNAF-multiplications processed so far _in this round_.                                                                                                                                                                                                  |
| \f$\msmround\f$           | msm_round                      | \f$[0, 32]\f$  |                                                  | current "round" of MSM, in \f$\{0, \ldots, 32\}\f$, which corresponds to the wNAF digit being processed. (final round deals with the `skew` bit.)                                                                                                                 |
| \f$\msmtransition\f$      | msm_transition                 | \f$\{0, 1\}\f$ | `(digit_idx == 0) && (row_idx == 0)`             | is 1 if the current row starts the processing of a different MSM, else 0 . Note this _not_ the same as the description of `transcript_msm_transition`                                                                                                             |
| \f$\msmadd\f$             | q_add                          | \f$\{0, 1\}\f$ |                                                  | 1 if we are adding points in the Straus MSM algorithm at current row                                                                                                                                                                                              |
| \f$\msmdouble\f$          | q_double                       | \f$\{0, 1\}\f$ |                                                  | 1 if we are doubling accumulator in the Straus MSM algorithm at current row                                                                                                                                                                                       |
| \f$\msmskew\f$            | q_skew                         | \f$\{0, 1\}\f$ |                                                  | 1 if we are incorporating skew points in the Straus MSM algorithm at current row                                                                                                                                                                                  |
| \f$\msmxone\f$            | add_state[0].point.x           | \f$\fq\f$      |                                                  | \f$x\f$-coordinate of first potential point (corresponding to add_state[0]) to add in Straus MSM round                                                                                                                                                            |
| \f$\msmyone\f$            | add_state[0].point.y           | \f$\fq\f$      |                                                  | \f$y\f$-coordinate of first potential point (corresponding to add_state[0]) to add in Straus MSM round                                                                                                                                                            |
| \f$\msmxtwo\f$            | add_state[1].point.x           | \f$\fq\f$      |                                                  | \f$x\f$-coordinate of second potential point (corresponding to add_state[1]) to add in Straus MSM                                                                                                                                                                 |
| \f$\msmytwo\f$            | add_state[1].point.y           | \f$\fq\f$      |                                                  | \f$y\f$-coordinate of second potential point (corresponding to add_state[1]) to add in Straus MSM                                                                                                                                                                 |
| \f$\msmxthree\f$          | add_state[2].point.x           | \f$\fq\f$      |                                                  | x-coordinate of third potential point (corresponding to add_state[2]) to add in Straus MSM round                                                                                                                                                                  |
| \f$\msmythree\f$          | add_state[2].point.y           | \f$\fq\f$      |                                                  | y-coordinate of third potential point (corresponding to add_state[2]) to add in Straus MSM round                                                                                                                                                                  |
| \f$\msmxfour\f$           | add_state[3].point.x           | \f$\fq\f$      |                                                  | x-coordinate of fourth potential point (corresponding to add_state[3]) to add in Straus MSM round                                                                                                                                                                 |
| \f$\msmyfour\f$           | add_state[3].point.y           | \f$\fq\f$      |                                                  | y-coordinate of fourth potential point (corresponding to add_state[3]) to add in Straus MSM round                                                                                                                                                                 |
| \f$\msmaddone\f$          | add_state[0].add               | \f$\{0, 1\}\f$ |                                                  | are we adding msm_x1/msm_y1 (resp. add_state[0]) into accumulator at current round?                                                                                                                                                                               |
| \f$\msmaddtwo\f$          | add_state[1].add               | \f$\{0, 1\}\f$ |                                                  | are we adding msm_x2/msm_y2 (resp. add_state[1]) into accumulator at current round?                                                                                                                                                                               |
| \f$\msmaddthree\f$        | add_state[2].add               | \f$\{0, 1\}\f$ |                                                  | are we adding msm_x3/msm_y3 (resp. add_state[2]) into accumulator at current round?                                                                                                                                                                               |
| \f$\msmaddfour\f$         | add_state[3].add               | \f$\{0, 1\}\f$ |                                                  | are we adding msm_x4/msm_y4 (resp. add_state[3]) into accumulator at current round?                                                                                                                                                                               |
| \f$\msmsliceone\f$        | add_state[0].slice             | \f$[0, 15]\f$  |                                                  | wNAF slice value (a.k.a. digit) for first point (corresponds to odd number in \f$\{-15, -13, \ldots, 15\}\f$ via the monotonic bijection)                                                                                                                         |
| \f$\msmslicetwo\f$        | add_state[1].slice             | \f$[0, 15]\f$  |                                                  | wNAF slice value (a.k.a. digit) for second point                                                                                                                                                                                                                  |
| \f$\msmslicethree\f$      | add_state[2].slice             | \f$[0, 15]\f$  |                                                  | wNAF slice value (a.k.a. digit) for third point                                                                                                                                                                                                                   |
| \f$\msmslicefour\f$       | add_state[3].slice             | \f$[0, 15]\f$  |                                                  | wNAF slice value (a.k.a. digit) for fourth point                                                                                                                                                                                                                  |
| \f$\msmlambdaone\f$       | add_state[0].lambda            | \f$\fq\f$      |                                                  | if add_state[0].add==1 (eqiv. if msm_add1 == 1), slope of the line between the two points being added. else 0.                                                                                                                                                    |
| \f$\msmlambdatwo\f$       | add_state[1].lambda            | \f$\fq\f$      |                                                  | if add_state[1].add==1 (eqiv. if msm_add2 == 1), slope of the line between the two points being added. else 0.                                                                                                                                                    |
| \f$\msmlambdathree\f$     | add_state[2].lambda            | \f$\fq\f$      |                                                  | if add_state[2].add==1 (eqiv. if msm_add3 == 1), slope of the line between the two points being added. else 0.                                                                                                                                                    |
| \f$\msmlambdafour\f$      | add_state[3].lambda            | \f$\fq\f$      |                                                  | if add_state[3].add==1 (eqiv. if msm_add3 == 1), slope of the line between the two points being added. else 0.                                                                                                                                                    |
| \f$\msmcollisionxone\f$   | add_state[0].collision_inverse | \f$\fq\f$      |                                                  | if add_state[0].add == 1, the difference of the \f$x\f$ values of the accumulator and the point being added. used to ensure incomplete ecc addition exceptions not triggered if msm_add1 = 1                                                                      |
| \f$\msmcollisionxtwo\f$   | add_state[1].collision_inverse | \f$\fq\f$      |                                                  | if add_state[1].add == 1, the difference of the \f$x\f$ values of the accumulator and the point being added.                                                                                                                                                      |
| \f$\msmcollisionxthree\f$ | add_state[2].collision_inverse | \f$\fq\f$      |                                                  | if add_state[2].add == 1, the difference of the \f$x\f$ values of the accumulator and the point being added.                                                                                                                                                      |
| \f$\msmcollisionxfour\f$  | add_state[3].collision_inverse | \f$\fq\f$      |                                                  | if add_state[3].add == 1, the difference of the \f$x\f$ values of the accumulator and the point being added.                                                                                                                                                      |
| \f$\msmaccumulatorx\f$    | accumulator_x                  | \f$\fq\f$      |                                                  | (accumulator_x, accumulator_y) = \f$A\f$ is the accumulated point                                                                                                                                                                                                 |
| \f$\msmaccumulatory\f$    | accumulator_y                  | \f$\fq\f$      |

### MSM algorithm and description

We have already given a high-level summary of the Straus algorithm. Let us get into the weeds!

The function signature is the following:

```
static std::tuple<std::vector<MSMRow>, std::array<std::vector<size_t>, 2>> compute_rows(
        const std::vector<MSM>& msms, const uint32_t total_number_of_muls, const size_t num_msm_rows)

```

In other words, `compute_rows` takes in a vector of MSMs (each of which is a vector of `ScalarMul`s), together with the total number of non-zero `mul` operations we compute and the (easy-to-compute) a priori size bound `num_msm_rows`, and returns a vector of `MSMRow`s and two vectors, which will represent our point-counts (i.e., will be fed into the lookup argument).

Before we get into the content, note that we may assume that no point is \f$\NeutralElt\f$ in any of the MSMs. Indeed, this is due to checks done by the Transcript Columns. However, it is in principle possible that some of the scalars are \f$0\f$; we do not force \f$\transcriptzonezero = 0 \Rightarrow \transcriptzone != 0\f$

Each row (after the first row) in the MSM table will belong to one of the MSMs we are assigned to compute in `msms`. For an `msm` of size `m`, the number of rows that will be added in the MSM table is:

\f[(\texttt{NUM-WNAF-DIGITS-PER-SCALAR + 1})\lceil \frac{m}{\texttt{ADDITIONS-PER-ROW}}\rceil + (\texttt{NUM-WNAF-DIGITS-PER-SCALAR} - 1) = 33\frac{m}{4} + 31.\f]
There is one other quirk we should explicate before entering the algorithm. In general, the logic for affine elliptic curve addition can have cases: when the \f$x\f$ coordinates match up. (Doubling cannot have cases for points on our affine elliptic curve because there is no \f$\fq\f$-rational \f$2\f$-torsion.) Moreover, in general our logic must branch if either our base or the accumulator is \f$\NeutralElt\f$. As we have indicated several times above, for optimization, we _represent_ \f$\NeutralElt\f$ as \f$(0, 0)\f$ in the code. It is advantageous to avoid this branching logic. We do so by _relaxing completeness_. In particular, we start off the accumulator of every MSM with a fixed `offset_generator`. This is a fixed point of \f$E\f$ that we may consider pseudo-random (though it is fixed and indeed hardcoded). Then we decree that for our MSM to be valid, in the course of the Straus algorithm, whenever I accumulate \f$A\leftarrow A + P\f$, the \f$x\f$-coordinates of \f$A\f$ and \f$P\f$ differ. This condition of being valid may be witnessed by the prover providing the inverse of the difference of the \f$x\f$-coordinates every time it is necessary.

This indeed breaks completeness, inasmuch as there are valid `EccOpQueue`s which will not be able to be compiled into a valid execution trace. However, this is vanishingly unlikely, in the course of any normal operations.

Finally, we may describe the algorithm. We implicitly organize our data in the following type of table (as indicated in the [Straus Section](#straus)). Each row of our table corresponds to a scalar multiplication: the elements of the row are the wNAF digits (including the `skew` bit). In other words, the columns of our table correspond to wNAF digits. Our algorithm will proceed column by column, from most significant to least significant digit, processing one vertical chunk of four elements after another. To emphasize: this table syntactically encoding our MSM is _not_ what we refer to as the MSM table of the VM, which rather witnesses the correct execution of the MSM.

1. Set the first row of the MSM table (of our VM) to be 0.
2. Initialize lookup table read counts: `point_table_read_counts[0]` and `point_table_read_counts[1]` to track the positive and negative lookups corresponding to \f$nP\f$, where \f$n\in \{-15, -13, \ldots, 13, 15\}\f$. Each table will have size `total_number_of_muls * 8` (since `POINT_TABLE_SIZE/2 = 8`).
3. Compute the MSM row boundaries: for each MSM, fill out the indices of where it starts and the starting \f$\msmpc\f$. This requires a calculation of the number of rows required, which we come back to in the [next section](#msm-size).
4. First pass: populate `point_table_read_counts` based on `msm[point_idx].wnaf_digits[digit_idx]`. Update read counts based on skew as well.

We deviate from the witness generation algorithm here. In the code, in order to minimize the number of field divisions, we first compute in projective coordinates, then batch-normalize back to affine to fill in the values affine values. Here we just specify the values of the various columns in a more naive way.

5. Set the accumulator at the beginning of every `msm` to be `offset_generator`. (This allows us to avoid case-logic in EC addition.)
6. For `digit-position` (a.k.a. column of my syntactic MSM table) in \f$0..31\f$:

   1. Populate the rows of the VM's MSM table as follows.

      1. Check if the row corresponds to a new `msm`. If so, set \f$\msmtransition = 1\f$.
      2. Process the (no greater than) `ADDITIONS_PER_ROW` points per row:

         1. Get the up-until-now value of the accumulator and set into \f$(\msmaccumulatorx, \msmaccumulatory)\f$. For the first row of an MSM, this is `offset_generator`, for a non-first row of an MSM this involves processing the previous row of the MSM table.
         2. Set \f$\msmadd = 1\f$, \f$\msmdouble = 0\f$, and \f$\msmskew = 0\f$.
         3. Set the booleans \f$\msmaddone\f$, \f$\msmaddtwo\f$, \f$\msmaddthree\f$, and \f$\msmaddfour\f$ to the correct values (all should be one if we haven't yet exhausted the column, if we are at the end of a column and \f$m\f$ is not divisible by 4, only the first \f$m\text{ mod} 4\f$ should be turned on).
         4. For each point that is "on", record the following (which all correspond to members of `AddState`):
            1. the slice a.k.a. digit value. (This has values in \f$\{0,\ldots,15\}\f$ and corresponds to the elements \f$\{-15, -13, \ldots, 13, 15\}\f$.) These are filled in \f$\msmsliceone\f$, \f$\msmslicetwo\f$, \f$\msmslicethree\f$, and \f$\msmslicefour\f$.
            2. The precomputed value of the slice/digit times the corresponding base point. These are filled in \f$\msmxone\f$, \f$\msmyone\f$, \f$\msmxtwo\f$, \f$\msmytwo\f$, \f$\msmxthree\f$, \f$\msmythree\f$, and \f$\msmxfour\f$, \f$\msmyfour\f$. Note that, as we are proceeding vertically, the base points corresponding to \f$\msmsliceone\f$, \f$\msmslicetwo\f$, \f$\msmslicethree\f$, and \f$\msmslicefour\f$ may very well all be different.
            3. Auxiliary values needed to compute the sum of the accumulator and the points-to-be-added into the accumulator: in particular, the slope of the line between the (intermediate) accumulator and the point-to-be-added. These are contained in \f$\msmlambdaone\f$, \f$\msmlambdatwo\f$, \f$\msmlambdathree\f$, and \f$\msmlambdafour\f$. Here, there is a subtle point: we do not explicitly record the intermediate values of the accumulator in this row in our VM's MSM table, although \f$\msmlambdatwo\f$, \f$\msmlambdathree\f$, and \f$\msmlambdafour\f$ reflect these values. Indeed, if \f$Q_1 = (\msmxone, \msmyone)\f$, \f$Q_2 = (\msmxtwo, \msmytwo)\f$, and our accumulator is starting at \f$A\f$, then \f$\msmlambdaone\f$ is the slope between the line \f$A\f$ and \f$Q_1\f$, while \f$\msmlambdatwo\f$ is the slope between the line \f$A+Q_1\f$ and \f$Q_2\f$. However, \f$A + Q_1\f$ is _not_ explicitly recorded in our MSM table.
            4. For each point that is "on", fill in the following values \f$\msmcollisionxone\f$, \f$\msmcollisionxtwo\f$, \f$\msmcollisionxthree\f$, and \f$\msmcollisionxfour\f$. These are the differences in the \f$x\f$ values between the (intermediate) accumulator and the point-to-be-added. This witnesses/verifies the fact that we don't have edge-case logic for the addition. As with the \f$\lambda\f$ values, these reflect the intermediate values of the accumulator although that intermediate value is _not_ explicitly recorded in our MSM table.

      3. Process the 4 doublings, as long as we are not at the last wnaf digit. This involves adding a _single_ row to the MSM table.
         1. Set \f$\msmadd = 0\f$, \f$\msmdouble = 1\f$, and \f$\msmskew = 0\f$.
         2. Get the value of \f$\msmaccumulatorx\f$ and \f$\msmaccumulatory\f$ from the last row.
         3. The values: \f$\msmcount\f$, \f$\msmtransition\f$, \f$\msmsliceone\f$, \f$\msmslicetwo\f$, \f$\msmslicethree\f$, \f$\msmslicefour\f$, \f$\msmxone\f$, \f$\msmyone\f$, \f$\msmxtwo\f$, \f$\msmytwo\f$, \f$\msmxthree\f$, \f$\msmythree\f$, \f$\msmxfour\f$, \f$\msmyfour\f$, \f$\msmcollisionxone\f$, \f$\msmcollisionxtwo\f$, \f$\msmcollisionxthree\f$, and \f$\msmcollisionxfour\f$ are all set to \f$0\f$.
         4. We set \f$\msmlambdaone\f$, \f$\msmlambdatwo\f$, \f$\msmlambdathree\f$, and \f$\msmlambdafour\f$ correctly: they are each the slope of the line passing through the current _intermediate_ accumulator tangent to \f$E\f$. For instance, \f$\msmlambdaone\f$ is the slope of the line through \f$A\f$, \f$\msmlambdatwo\f$ is the slope through \f$2A\f$, etc.
      4. Process the skew digit in an analogous way to the processing of the additions.

### MSM size

Suppose we have an MSM of short scalars of size \f$m\f$. Then the number of rows we add to the MSM table of the VM is:

\f[(\texttt{NUM-WNAF-DIGITS-PER-SCALAR + 1})\lceil \frac{m}{\texttt{ADDITIONS-PER-ROW}}\rceil + (\texttt{NUM-WNAF-DIGITS-PER-SCALAR} - 1) = 33\frac{m}{4} + 31.\f]
Indeed, there are \f$\lceil \frac{m}{\texttt{ADDITIONS-PER-ROW}}\rceil\f$ `add`-rows per digit, and there are \f$\texttt{NUM-WNAF-DIGITS-PER-SCALAR + 1}\f$ digits per scalar (where the last digit is the `skew` digit). Finally, the last term comes from the doublings.

Note that in the regime where we have a few long MSMs, this is asymptotic to \f$8.25m\f$, which is comparable to the \f$8m\f$ we get from the precomputed columns. On the other hand, if we have many very short MSMs, the size of this table dominates what was produced by the precomputed columns.

## Multisets and Lookups

As explained in the introduction, we sometimes treat these three sets of disjoint columns as three separate tables. There must be a mechanism to ensure that they "communicate" with each other. We do _not_ use bare copy-constraints; instead, we use three multisets equality checks. (These were formerly called "strict lookup arguments", where every write had to have precisely one corresponding read.) The goal of these section is to sketch how these constraints, together with the lookups, fully piece together the ECCVM. We emphasize that this is merely a sketch; for full details, please see the [set relation](../relations/ecc_vm/ecc_set_relation_impl.hpp).

### Multisets

The basic structure: each term corresponds to _two_ multisets. (One could refer to these as an input multiset and an output multiset, but this directionality is purely psychological and we avoid it.) One table contributes to one of the multisets, another table constributes to the other multiset, and the term is _satisfied_ if the two multisets are equal.

#### First term: `(pc, round, wnaf_slice)`

This facilitates communication between the Precomputed table and the MSM table. Recall that `pc` stands for point-counter. `round` refers to the wNAF digit-place being processed and `wnaf_slice` is the _compressed_ digit (i.e., it is a way of representing the actual wNAF digit). Recall that the skew digit's place corresponds to `round == 32`. This multiset check ensures that at every `round`, for a given point, the wNAF digit computed by the Precomputed table is actually being used by the MSM table.

#### Second term: `(pc, P.x, P.y, scalar-multiplier)`

This facilitates communication between the Precomputed table (and more specifically, the PointTable) and the Transcript table. More precisely, it ensures that the Precomputed table has done the wNAF decomposition correctly for the scalar corresponding to the point at position `pc`.

#### Third term: `(pc, P.x, P.y, msm-size)`

This facilitates communication between the MSM table and the Transcript table. More precisely, this links the _output_ of the MSM (that is performed by the MSM table) to what is written in the Transcript table. We also ensure that `msm-size` is correctly inputed into the MSM table.

### Lookups

Unlike the multisets (a.k.a. "strict lookup arguments"), the lookups here are more conventional. For every non-trivial point \f$P\f$, there is a lookup table (computed by the Precomputed table) that contains `(pc, compressed_slice, (2 * (compressed_slice) - 15)[P])`, where `compressed_slice` is in the range {0, ..., 15}. The MSM table will look up the relevant value as it goes through the Straus algorithm. For full details, please see [lookup relation](../relations/ecc_vm/ecc_lookup_relation.hpp).
