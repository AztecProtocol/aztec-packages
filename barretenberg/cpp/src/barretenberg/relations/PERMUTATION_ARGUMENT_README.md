# The Generalized Permutation Argument (with public inputs)

This document describes the 4-wire generalized permutation argument with public inputs as implemented in `permutation_relation.hpp`. See the references below for more information. As always, the code is the source of truth.

## Overview

The generalized permutation argument enforces two types of constraints using a single grand product:

1. **Copy constraints**: If two wires should hold the same value, the permutation argument guarantees.

2. **Multiset equality**: If two sets of wire positions should contain the same multiset of values (possibly in different order), then this is enforced.

## Notation
- $\mathbb F$ is a cryptographically large field
- A _polynomial_ means a multilinear ($r$-variate) polynomial with coefficients in $\mathbb F$, equivalently specified by the values on the boolean hypercube of dimension $r$. We often identify the $r$-dimensional boolean hypercube with $[0, \ldots, 2^r-1]$ via binary counting.
- $w_1, w_2, w_3, w_4$: Wire polynomials (also called $w_l, w_r, w_o, w_4$)
- $\sigma_1, \sigma_2, \sigma_3, \sigma_4$: Permutation polynomials encoding copy cycles
- $\text{id}_1, \text{id}_2, \text{id}_3, \text{id}_4$: Identity polynomials
- $Z_{\text{perm}}$: Grand product accumulator polynomial
- $\beta, \gamma$: Verifier challenges (Schwartz-Zippel randomness)
- $\delta_{\text{pub}}$: Public input delta (correction factor)
- $L_0$: Lagrange polynomial that is 1 at the first row
- $L_{\text{last}}$: Lagrange polynomial that is 1 at the last active row
- $n\leq 2^r$: Circuit size
- $\text{SEPARATOR}$, an integer greater than $2^r\geq n$.

## The Identity and Sigma Polynomials

The identity polynomials assign a unique value to each wire position:

$$
\text{id}_j(i) = i + (j-1) \cdot \text{SEPARATOR}.
$$
In particular, if $\text{id}_a(b) == \text{id}_c(d)$, then $(a,b) == (c,d)$.

The sigma polynomials $\sigma_j$ encode the permutation which corresponds to the copy constraints. If wire $j$ at row $i$ is copy-constrained to wire $k$ at row $m$, then:

$$
\sigma_j(i) = m + (k-1) \cdot \text{SEPARATOR},
$$
i.e., $\sigma_j(i)$ is sent to $(k, m)$ under the _same encoding_ as above.

In particular, when there is no copy constraint, $\sigma_j(i) = \text{id}_j(i)$.

## The Grand Product Argument
The core idea: let $S$ and $T$ be two multisets whose elements are in $\mathbb F$. If for a random $\gamma\in \mathbb F$:

$$
\prod_{s \in S} (\gamma + s) = \prod_{t \in T} (\gamma + t),
$$

then $S=T$ (as multisets) with high probability. (Conversely, if $S=T$, of course the above product holds for all $\gamma$.)

### Take 1: Grand product polynomial for bare copy constraints
For *copy constraints*, we check that the multiset of (wire value, position) pairs is preserved under the permutation $\sigma$. Concretely, we compute the grand product:

$$
Z_{\text{perm}}(v) = \prod_{i=1}^{v-1} \frac{\prod_{j=1}^{4} (w_j(i) + \beta \cdot \text{id}_j(i) + \gamma)}{\prod_{j=1}^{4} (w_j(i) + \beta \cdot \sigma_j(i) + \gamma)}
$$

If copy constraints are satisfied, then this product equals $1$. In fact, due to our optimization for public inputs, this product will end up being $\delta_{\text{pub}}$.
## Relations
### The Recurrence Relation (Subrelation 0)

The grand product multilinear polynomial $Z_{\text{perm}}$ has the values $Z_{\text{perm}}(0)=0$, $Z_{\text{perm}}(1)=1$, and is defined by the recurrence:

$$
Z_{\text{perm}}(i+1) = Z_{\text{perm}}(i) \cdot \frac{\prod_{j=1}^{4} (w_j(i) + \beta \cdot \text{id}_j(i) + \gamma)}{\prod_{j=1}^{4} (w_j(i) + \beta \cdot \sigma_j(i) + \gamma)}
$$


The relation verified at each row is:

$$
\left( Z_{\text{perm}} + L_0 \right) \cdot \prod_{j=1}^{4} (w_j + \beta \cdot \text{id}_j + \gamma) - \left( Z_{\text{perm,shift}} + L_{\text{last}} \cdot \delta_{\text{pub}} \right) \cdot \prod_{j=1}^{4} (w_j + \beta \cdot \sigma_j + \gamma) = 0
$$

The $L_0$ term handles the boundary condition at the first row. The $L_{\text{last}} \cdot \delta_{\text{pub}}$ term handles public inputs (see below). In particular, if there are no public inputs, then $\delta_{\text{pub}} == 1$.

### The Boundary Constraint (Subrelation 1)

At the last active row (where $L_{\text{last}} = 1$), we require:

$$
L_{\text{last}} \cdot Z_{\text{perm,shift}} = 0
$$

This ensures the grand product "closes".

### The Initialization Constraint (Subrelation 2)

At the first row (where $L_0 = 1$), we require:

$$
L_0 \cdot Z_{\text{perm}} = 0
$$

This explicitly enforces $Z_{\text{perm}}(0) = 0$, which is necessary for the grand product to start at $1$ (via the $Z_{\text{perm}} + L_0$ term in the recurrence).

## The Generalized Permutation Argument: Tags and Multiset Equality

The generalized permutation argument extends the basic copy-constraint mechanism to also enforce **multiset equality** between tagged sets of values.

### Motivation

Sometimes we need to prove that two sets of wire values are equal as multisets (same elements, possibly in different order) without specifying the permutation that renders the equality of ordered lists. In Barretenberg, this occurs with range constraints and memory (ROM/RAM) operations.

### Tags and the $\tau$ Permutation

Each variable in the circuit can be assigned a **tag**. Tags are organized into pairs via a permutation $\tau$.

- `get_new_tag()`: Allocates a fresh tag
- `set_tau_transposition(tag_a, tag_b)`: Sets $\tau(\text{tag\_a}) = \text{tag\_b}$ and $\tau(\text{tag\_b}) = \text{tag\_a}$
- `assign_tag(variable_idx, tag)`: Associates a variable with a tag

Variables without an explicit tag assignment receive `DEFAULT_TAG`, and $\tau(\text{DEFAULT\_TAG}) = \text{DEFAULT\_TAG}$. We assume that the `DEFAULT_TAG` is not part of any multiset-equality check.

The extra constraint we wish to impose is: as multisets, variables with `tag_a` and variables with `tag_b` are equal.

**NOTE**: In the original Generalized Permutations paper, care is taken to allow for arbitrary permutations-on-tags $\tau$. In our codebase, $\tau$ is always a product of _disjoint_ transpositions in our implementation, i.e., always a permutation of order 1 or 2.
### How Tags are used in Barretenberg
As explained, variables are by default assigned the `DEFAULT_TAG`. Tags are used in exactly two ways in Barretenberg.

* If a usual (a.k.a. pre-Fiat-Shamir) witness is assigned a non-trivial tag, then this tag corresponds to a non-trivial "small" range constraint, which is mediated by the method `create_small_range_constraint`. Moreover, different tags correspond to different range-constraints. This allows us to efficiently batch range-constraints in the circuit.
* The only other tags that occur are for witnesses generated after Fiat-Shamir. These occur in memory ops, as the algorithm for verifying memory ops involves multiset-equality checks.

We trust that this dichotomy is not too confusing, as there is _no meaning_ for witnesses generated post-Fiat-Shamir being range-constrained.
### How Tags Modify the Permutation

Consider a copy cycle for a variable with tag $t$. In the standard permutation argument, the cycle would close: the last element's sigma points back to the first element's id.

### Take 2: Grand product polynomial with tags
With tags, we modify the id and sigma polynomials as follows.

- The **first** element of the cycle: $\text{id}$ is set to the tag value $t$
- The **last** element of the cycle: $\sigma_1$ points to $\tau(t)$ instead of wrapping back

This modification means:
- The numerator of the grand product includes a factor with the tag $t$
- The denominator includes a factor with $\tau(t)$

### The Multiset Equality Guarantee

Suppose we have two tags $t_1$ and $t_2$ with $\tau(t_1) = t_2$ (and $\tau(t_2) = t_1$). Let:
- $S_1$ = multiset of wire values assigned tag $t_1$
- $S_2$ = multiset of wire values assigned tag $t_2$

Then we claim that the grand product will equal 1 only if $S_1 = S_2$ as multisets.

**Why?** Each value $v$ in $S_1$ contributes a factor $(v + \beta \cdot t_1 + \gamma)$ to the numerator (via the id polynomial) and a factor $(v + \beta \cdot \tau(t_1) + \gamma) = (v + \beta \cdot t_2 + \gamma)$ to the denominator (via sigma). Similarly, each value in $S_2$ contributes $(v + \beta \cdot t_2 + \gamma)$ to the numerator and $(v + \beta \cdot t_1 + \gamma)$ to the denominator.

For the product to equal 1, the multiset of $(v + \beta \cdot t_1 + \gamma)$ factors from $S_1$ must cancel with the $(v + \beta \cdot t_1 + \gamma)$ factors from $S_2$ in the denominator, and similarly for $t_2$. This happens if $S_1 = S_2$; conversely, if this happens, then with high probability $S_1 = S_2$.


### Tag Values in Polynomials

To ensure tag values don't collide with wire position encodings, tags are placed in a disjoint range:

$$
\text{tag\_value} = \text{SEPARATOR} \cdot \text{NUM\_WIRES} + \text{tag\_index}.
$$

This ensures tag values never collide with the position encodings.

## Public Inputs

We have special handling for public inputs.

### Wire structure

Public inputs $x_0, \ldots, x_{m-1}$ are placed in wires $w_1$ _and_ $w_2$ at rows $0, \ldots, m-1$. (We later consider the case of an offset.) In particular, if we followed the above argument, we would have $\sigma_1(i) = \text{id}_2(i)$, encoding the first copy constraint (that the wire values at row $i$ in $w_1$ and $w_2$ are the same.)

### The change: Public Input Delta

The sigma polynomial for public inputs is set to:

$$
\sigma_1(i) = -(i+1) \quad \text{for } i = 0, \ldots, m-1
$$

This breaks the natural permutation cycle. To compensate, we compute a correction factor:

$$
\delta_{\text{pub}} = \prod_{i=0}^{m-1} \frac{\gamma + x_i + \beta \cdot (\text{SEPARATOR} + i)}{\gamma + x_i - \beta \cdot (i + 1)}
$$

The numerator corresponds to what the identity polynomial would contribute, and the denominator corresponds to what the modified sigma contributes.

Note that the verifier can compute this easily herself.

### Public Input Offset

If public inputs start at row `offset`, the formula adjusts to:

$$
\delta_{\text{pub}} = \prod_{i=0}^{m-1} \frac{\gamma + x_i + \beta \cdot (\text{SEPARATOR} + \text{offset} + i)}{\gamma + x_i - \beta \cdot (\text{offset} + i + 1)}
$$


### Relevant Files

- `permutation_relation.hpp`: The two subrelations
- `grand_product_library.hpp`: Computation of $Z_{\text{perm}}$
- `grand_product_delta.hpp`: Computation of $\delta_{\text{pub}}$ (with detailed documentation)
- `honk/composer/permutation_lib.hpp`: Construction of sigma/id polynomials from copy cycles and tags
- `stdlib_circuit_builders/ultra_circuit_builder.hpp`: Tag API

### The Skip Optimization

The relation includes a `skip()` function that returns true when $Z_{\text{perm}}(v) = Z_{\text{perm,shift}}(v)$. If this occurs, then with very high probability, this row is not involved in a copy constraint. This allows us to avoid certain sumcheck computations at this row.

## References

- [PLONK paper](https://eprint.iacr.org/2019/953): Original permutation argument
- [Public Inputs](https://github.com/arielgabizon/plonk-addendum/blob/master/plonk-pubinputs.pdf)
- [Generalized permutations](TOADD) TOADD
