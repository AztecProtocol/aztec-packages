# VM Circuit Recipes

## Setting and Rules of the Games

The zk proof of execution of some given computation performed by the public VM consists of table of elements over a prime field of order $r$. The logical constraints of the proof are being translated into algebraic relations between **entire** columns of the table. Each column is then expressed by a polynomial over $\mathbb{F}_r$ in order to produce the zk proof.

* $r-1$ is a multiple of a power of 2, i.e., $2^n \mid r-1$ and in our setting (scalar field oif BN254 curve) $n=28$.
* Number of rows is a **power of two** smaller than $2^n$ (FFT optimization. Note that for Honk $r-1$ does not have to be a multiple of a power of 2). It suffices to pad the 'empty' rows with zero values.
* An algebraic relation applies for each row and corresponds to an algebraic equations on each $\mathbb{F}_r$ element, one element per column. (consolidated over the whole column through polynomials). By algebraic equation we mean a multivariate polynomial equals to zero where each column element represents a variable.
* An algebraic relation can additionally involve element of the **next** row. (cycling shift)

**OPEN:** Is the degree of the algebraic relation polynomials limited in practice (relative to r)?


## Crux of the Task
Some difficulties
* Express any naturally non-algebraic constraint over a prime field (e.g., bitwise operations, etc, ...)
* Relations must apply over entire column
* Model memory of the VM through such algebraic relations


## Just Verify
Computation of the right values (witnesses) are outside of this scope and can be done without any specific restriction. What matters is to set the right values such that they satisfy certain relations. A zk proof merely consists at proving that such relations are correct. For instance, computing a shift operation can be done without field algebra but the crux of the problem consists in expressing that this shift is correct based on field algebra.

## Logical Conjunction of Relations
Per default, we can have several relations (called sub-relations) to be satisified, i.e., they are naturally conjunctive (logical **AND**). For instance, we can have restriction that each element of column 1 is boolean and at the same time that element of column 2 is twice the value of column 3:

$$
x_1(x_1 - 1) = 0 \text{ AND } x_2 - 2x_3 = 0
$$
where $x_i$ denotes element of column $i$.


## Dispatching/Subset of Relations
Often one needs to enforce only a subset of different relations instead of all of them. This can be achieved through additional columns of booleans **(selectors**) consisting in toggling a given sub-relation. Assuming we have 4 relations over two columns represented with polynomials $P_1$, $P_2$, $P_3$ and corresponding selectors columns with element denoted $q_1$, $q_2$, $q_3$, we can toggle any subset of relations by expressing a new relations over 5 columns (instead of 2) as follows:

$$
q_1 * P_1(x_1, x_2) = 0 \text{ AND } q_2 * P_2(x_1, x_2) = 0 \text{ AND } q_3 * P_3(x_1, x_2) = 0
$$

Activating only the second relation corresponds to set $q_1 = q_3 = 0$ and $q_2 = 1$.

## Activating a Relation conditioned by a boolean disjunction
Given some boolean values $q_i$'s, we can activate a relation $P$ conditioned by any boolean being true as follows:

$$(q_1 + q_2 + q_3 ...)P() = 0$$


## Assignment
The execution trace consists in relation and the concept of assigning an element to a variable does not per se exists. We can set an element in the execution table being equal to another value but the main task consists in proving the equality of both elements. Within the same row or between two adjacent rows this can be easily done. For other elements, we would need copy-constraint which is a concept not available in the context of a VM (constraints are dynamic in this context and not known in advance).

## Conditional Assignment
Let $q$ a boolean selector and assign value $x$ to $z$ if $q$ is true otherwise assign value $y$. This is realized as:

$$ (x-y)q + y - z = 0$$

## Conditional Negation
Based on boolean selector $q$, we assign the value of $x$ to $y$ or its negation:

$$ (1-2q)x - y = 0 $$

## Algebraic tricks
### Boolean Validation
$$ 
x(x-1) = 0
$$
### Boolean OR
$$
(1-x)(1-y) = 0
$$
### Boolean AND
$$
1 - xy = 0
$$

### Non-Equality to Zero
In a prime field only the element zero is non-invertible, i.e., a non-equality to zero is equivalent to show that the element is invertible. It suffices to compute the inverse $y=x^{-1}$ (not in circuit) and using it as as witness in the following relation
$$
1 - x y = 0
$$
#### With Error Support
In a VM context, one wants to support failures. Here, we want to express the error $e$ as boolean type by setting it to true, i.e., value $1$. This boolean $e$ can be thought as "is equal to zero". The relation becomes:
$$
(1-e)(1-xy) = 0
$$
Another equivalent relation is:
$$
xy - 1 + e = 0
$$
Note that if $x = 0$, the relation is satisfied only if $e=1$. However, this is not sufficient because $y$ could have been chosen to be zero. Therefore, we need a second relation enforcing $y = 1$ when $e$ is true:
$$
e(y - 1) = 0
$$
The last two relations can be merged into a single relation:
$$
x(e(1-y) + y) - 1 + e = 0
$$
Note that this one does not enforce $y=1$ if $e=1$ but satisfies the desired result, namely that $$ e=0 \Longrightarrow xy - 1 = 0 \text{ AND } e=1 \Longrightarrow x = 0 $$
**IMPORTANT:** We still need to constrain $e$ to be boolean, i.e., $e * (1 - e) = 0$.

### Equality and Non-equality of Field Values
We apply the above recipe on the difference of the two values and using a boolean $e$ to prove equality or non-equality.

*OPEN QUESTION:* *In BB, field equality is using the recipe with the single relation while zero equality is using the conjunction of two separate relations. Why?*

## Accumulator
In a lot of use cases, one wants to perform a list of long chained computations and maintain the partial result in an accumulated value. This is a common pattern which takes advantage on the fact that a relation can be expressed with values of the adjacent/next row. Hence, this allows to accumulate partial result from one row to the next without the need to use copy-constraints (which are not available in the context of a VM).

As an example (taken from field.cpp stdlib Barretenberg), let us consider the computation of a sum over a list of 9 elements $l_1, l_2, l_3, \ldots l_9$.
We add one column for the accumulator which will keep track of the partial sums. A little caveat is that the partial sums are computed right-to-left, i.e., first we add $l_7, l_8, l_9$ and then add $l_4, l_5, l_6$ etc ..
The execution trace and relations for this example are below.

| Column 1 | Column 2 | Column 3 |  Acc  |             Relation              |
|:--------:|:--------:|:--------:|:-----:|:---------------------------------:|
|  $l_1$   |  $l_2$   |  $l_3$   | $s_3$ | $s_3 - l_1 - l_2 - l_3 - s_2 = 0$ |
|  $l_4$   |  $l_5$   |  $l_6$   | $s_2$ | $s_2 - l_4 - l_5 - l_6 - s_1 = 0$ |
|  $l_7$   |  $l_8$   |  $l_9$   | $s_1$ |    $s_1 - l_7 - l_8 - l_9 = 0$    |

**Note on Caveat:** Computing the partial sums left-to-right seems more intuitive but leads to the issue that the first relation would not involve element of the next row ($s_1 - l_1 - l_2 - l_3 = 0$) and then we would have to access element of the previous row in the subsequent relations which are not possible in the proof system, namely: $s_2 - l_4 - l_5 -l_6 - s_1 = 0$.

## Comparison between range constrained numbers
Given two numbers, $x$ and $y$, range constrained to be smaller than a field element, constraining a boolean column $c$ that expresses if a number is strictly less than the other $x < y$ can be done with the following strategy:

The two cases to consider are:
 - When $c$ is one, $x < y$, which means that $y - x - 1 >= 0$
 - When $c$ is zero, $x >= y$, which means that $x - y > 0$

In order to verify these inequalities, we can use a range check to constrain the $c$ claim:
 - When $c$ is one, $rangecheck(y - x - 1, bits)$
 - When $c$ is zero,  $rangecheck(x - y, bits)$

This is because, if the claim $c$ would be incorrect, the result of the associated operation would be < 0. That would make it so the Field element wraps and becomes $P - abs(result)$. 

If the original values, are range constrained to be, let's say, a 64 bit number, a correct claim for the first case can result to at most $2^{64} - 1$ and at least 0. The result of a false claim, would go from $P - 2^{64}$ to $P - 1$.

By range checking the result of the operation to 64 bits, we can ensure that only correct claims are provable, since the false claims will generate a result that falls out of the range of 64 bits.

We can typically create these constraints as:
```
c * (1 - c) = 0;
pol X_GTE_Y = x - y;
pol X_LT_Y = y - x - 1;
pol commit result;
// Standard conditional assignment constraint:
(X_LT_Y - X_GTE_Y) * c + X_GTE_Y - result = 0;
// Now we'd have to range check result to the Max(x_bit_size, y_bit_size)
```

## Batching comparison of n-bit numbers

TODO(fcarreiro): write explanation.

For example, tags. See https://github.com/AztecProtocol/aztec-packages/pull/14632#discussion_r2137281685

```
// This error is true iff some final check failed. That is if some tag is not the expected one.
// Observe that we don't need to know exactly which one failed.
// We use this fact to "batch" the checks and do only 1 comparison against 0 (inverse check).
pol commit sel_register_read_error;
sel_register_read_error * (1 - sel_register_read_error) = 0;
// Each tag takes at most 3 bits, we can encode all of them in a field.
// This diff will be 0 iff all tags are the expected one.
pol BATCHED_TAGS_DIFF_REG = sel_tag_check_reg[0] * 2**0  * (mem_tag_reg[0] - expected_tag_reg[0])
                          + sel_tag_check_reg[1] * 2**3  * (mem_tag_reg[1] - expected_tag_reg[1])
                          + sel_tag_check_reg[2] * 2**6  * (mem_tag_reg[2] - expected_tag_reg[2])
                          + sel_tag_check_reg[3] * 2**9  * (mem_tag_reg[3] - expected_tag_reg[3])
                          + sel_tag_check_reg[4] * 2**12 * (mem_tag_reg[4] - expected_tag_reg[4])
                          + sel_tag_check_reg[5] * 2**15 * (mem_tag_reg[5] - expected_tag_reg[5])
                          + sel_tag_check_reg[6] * 2**18 * (mem_tag_reg[6] - expected_tag_reg[6]);
pol commit batched_tags_diff_inv_reg;
pol BATCHED_TAGS_DIFF_X_REG = (1 - sel_should_read_registers) * BATCHED_TAGS_DIFF_REG;  // Forces 0 if we don't read the register.
pol BATCHED_TAGS_DIFF_Y_REG = batched_tags_diff_inv_reg;
pol BATCHED_TAGS_DIFF_E_REG = 1 - sel_register_read_error;
pol BATCHED_TAGS_DIFF_EQ_REG = BATCHED_TAGS_DIFF_X_REG * (BATCHED_TAGS_DIFF_E_REG * (1 - BATCHED_TAGS_DIFF_Y_REG) + BATCHED_TAGS_DIFF_Y_REG) - 1 + BATCHED_TAGS_DIFF_E_REG;
#[REGISTER_READ_TAG_CHECK]
BATCHED_TAGS_DIFF_EQ_REG = 0;
```

## Element in a Set
Asserting that $x$ belongs to a set $\{a_1, a_2, a_3, \ldots a_n \}$ is done as follows:

$$ \prod_{i=1}^{n} (x-a_i) = 0 $$

## Inclusion and Equivalence Checks
We briefly provide an overview on the inclusion/equivalence checking tools without going into the math/crypto details to implement them. The two following hackmd documents provide more details:
[UltraPlonk Generalised Permutations, range constraints, RAM and ROM tables](https://hackmd.io/@aztec-network/Byky93bXs?type=view)
[UltraPlonk Plookup Algebra](https://hackmd.io/@aztec-network/ByjS5GplK?type=view)

### Column Equivalence Check
Two columns can be proven equivalent in the sense that they contain the same values but in a different order.

### Column Inclusion Check
A column $C$ is included in another column $C'$ if any element of $C$ appears in $C'$. Possibly, a given value $x$ in $C$ might appear multiple times and only once in $C'$. Also, some values of $C'$ might not be present in $C$.

### Tuple Inclusion Check
We can generalize the inclusion concept over multiple columns by considering the tuple of elements present in a given row of the considered columns. For instance, an inclusion check of columns $(C_1, C_2, C_3)$ into columns $(C_4, C_5, C_6)$ consists in showing that for every row $i$, there exists a row $j$ such that 
$$ (C_{1,i}, C_{2,i}, C_{3,i}) =  (C_{4,j}, C_{5,j}, C_{6,j}) $$
where $C_{k,l}$ denote the element of column $C_k$ in row $l$.

### Lookup Table
A lookup table is a table which contains some pre-computed values (known at compile-time) of some recurrent computations required by the circuit. For instance, XOR or or other bitwise operations which are costly to arithmetize can strongly benefit from this techniques.

A look up table for a binary operation over 8-bit elements can be implemented with 3 columns of $2^8 * 2^8 = 2^{16}$ rows. All possible computation of the binary operation $(a,b) \rightarrow c$ are thus filled into the following table:

|  a  |  b  |       c       |
|:---:|:---:|:-------------:|
|  0  |  0  |   $c_{0,0}$   |
|  0  |  1  |   $c_{0,1}$   |
|  0  | ... |      ...      |
|  0  | 255 |  $c_{0,255}$  |
|  1  |  0  |   $c_{1,0}$   |
|  1  |  1  |   $c_{1,1}$   |
|  1  | ... |      ...      |
|  1  | 255 |  $c_{1,255}$  |
| ... | ... |      ...      |
| 255 | 255 | $c_{255,255}$ |

Lookup is then implemented as a tuple inclusion of some columns against the precomputed lookup columns.

#### Dispatching over Several Tables
One can store several lookup tables in the same columns by adding an additional column identifier which identifies the operation such as XOR:
| id  |  a  |  b  |        c        |
|:---:|:---:|:---:|:---------------:|
|  0  |  0  |  0  |   $c_{0,0,0}$   |
|  0  | ... | ... |       ...       |
|  0  | 255 | 255 | $c_{0,255,255}$ |
|  1  |  0  |  0  |   $c_{0,0,0}$   |
|  1  | ... | ... |       ...       |
|  1  | 255 | 255 | $c_{0,255,255}$ |

### Range Check
A range check over a column consists in proving that all column elements belong in a given range interval $[a,b]$. Typically, one wants to constrain elements to have a certain number of bits, e.g, $a=0$ and $b=2^B-1$ with $B$ being the number of bits.

#### Pre-computed Table
When the range check is known at compile-time, one can fill a pre-computed column with all the values in the range, i.e., $0,1,2,3,4, \ldots 2^B-1$. The range check on a column $C$ consists in enforcing inclusion check of $C$ into the pre-computed column.

#### Dynamic Table
If the range check is not known at compile time, one has to build the "range column" denoted $RC$ dynamically with the following properties:
1. $RC_0 = 0$
2. $RC_{n-1} = 2^B -1$ ($n$ denoting the size of a column)
3. $$(RC_{i+1} - RC_i)^2 - (RC_{i+1} - RC_i) = 0$$

Basically, $RC$ contains all the values in the range and we need to pad the column so that the above conditions hold.
Finally, the range check on column $C$ is performed by performing an inclusion check to $RC$.

#### Dynamic Range Check based on Static one
Let us assume that we pre-populated a column to perform range check in $[0,R]$. We want to perform a dynamic check (run-time) on $[0,B]$ where $B<R$.

For a value $x$, we can perform this with two static range checks:
1. $0 \leq x \leq R$
2. $0 \leq B-x \leq R$

One might be tempted to say that only the last condition would be sufficient. However, $x$ could be very large (slightly negative) so that $B-x$ largely underflows to end up in the range $[B+1,R]$. This happens when $x \in [p+B-R, p-1]$.

If $B > R$, one can also perform dynamic checks based on the static ones. This is possible by decomposing the value $x$ as a sum of power of $R$ and perform range check over the coefficients.

## Type Conversion
### Slices
Slicing a field element $x < 2^B$ consists in decomposing $x$ into two or more contiguous pieces of (slices) of the bit representation of $x$. The corresponding arithmetic of slicing $x$ into two slices correspond to write

$$ x = h * 2^A + l $$

for integers $A$, $0 \leq l < 2^A$ and $0 \leq h < 2^{B-A}$.
A slicing relation will consist in the above equality and a range-constraint for each of the slices, i.e., on $l$ and $h$.
A generalization to more slices follows the same principle and for each additional slice one needs one additional range-constraint.

**Warning**: Depending on the slice decomposition (in particular into bits), one has to be careful about the unique representation of the original value. Namely, a representation might "overflow" the size of the field. (See decompose_into_bits() in field.cpp)

### TBD Conversions

## Memory Traces

TBD: Should we also talk about ROM and RAM tables?

## Enum-based Activation
Let us assume that we would like to activate a different relation or equivalence checks based on any different value taken by a variable/column. The number of possible values is assumed to be greater than 2.

What is the best possible way to implement this?
1. Single column/enum
2. Encode enum in binary and use one bit per column
3. Flattening: Use as many column as the enum cardinality and the boolean toggles the desired enum value.

### Example
Let OP be an opcode enum with 8 possibles opcodes: OP0, OP1, OP2, OP3, OP4, OP5, OP6, OP7.

#### Single column
Column OP with numerical values 0,1,2,3,4,5,6,7.

Activation for OP3 would look like this (denote by $x$ the column variable):

$$ x \cdot (x-1) \cdot (x-2) \cdot (x-4) \cdot (x-5) \cdot (x-6) \cdot (x-7)  $$

**Overhead**: Add 7 to the polynomials degree and 1 column

#### Binary Decomposition
Three bit columns $b_0$, $b_1$, and $b_2$ such that
$$ x = b_0 + b_1 \cdot 2 + b_2 \cdot 2^2 $$

Activation for OP3 ($b_0 == 1$, $b_1 == 1$, $b_2 == 0$):

$$ b_0 \cdot b_1 \cdot (b_2 - 1)$$

**Overhead**: Add 3 to the polynomials degree and 3 columns

#### Toggling Column/Flattened Version
8 bit columns $OP_0$, $OP_1$, .. $OP_7$.
Activation for OP3 just based on $OP_3$ boolean.

**Overhead**: Add 1 to the polynomials degree and 8 columns

### Area of non-zero values
Let us assume that we have $N$ rows and each row will have exactly an enum value and a uniform distribution of the enum.

Area of non-zero values in the trace:
1. Single column: $N$
2. Binary Decomposition: $$ \lceil \log_2(N) \rceil \cdot N/2$$
3. Toggling Columns: $N$

### Conclusion - Use Flattening
Flattening is the way to go as it adds only 1 degree in the polynomials and the area is the same as with single column. There is an improvement suggested by Kesha based on lookup mapping an enum value to the toggling decomposition of the enum onto the columns. This would save all the constraints that the values in the toggling columns are bit as this would be guaranteed through the lookup.
