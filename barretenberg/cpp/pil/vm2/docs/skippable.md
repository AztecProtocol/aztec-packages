# Skippable Mechanism

## Introduction

For each sub-trace defined in a .pil file, one can optionally add so-called "skippable" condition which allows to improve performance on prover side whenever the "skippable" condition is satisfied. It basically skips some accumulation computation in sumcheck protocol to all sub-relations pertaining to the sub-trace. Here a "sub-trace" can be virtual or not, i.e., each virtual sub-trace has their own skippable condition (which might be the same though). More on how to define a valid "skippable" condition in the next section. We emphasize that the "skippable" mechanism does not change the behavior of the verifier and therefore does not present any security risk about soundness, i.e., it does not help a malicious prover to prove a wrong statement even if the "skippable" condition is too relaxed. What can however happen is that the verification fails when it should not (perfect completeness is not guaranteed anymore if we wrongly skip).

## Explanations

A sub-trace contains a list of algebraic sub-relations/equations which must be satisfied. We do not consider lookups nor permutations in this discussion (they are using the same skippable condition defined in interactions_base.hpp consisting in skipping when the inverse column entry is zero).

A valid "skippable" condition is a condition defined on some columns which guarantee that the accumulation in sumcheck rounds will be zero for this sub-trace, i.e., any sub-relation contribution will be zero. This means that the sub-relation is satisfied (equal to zero) with columns values accumulated during sumcheck rounds.

## Strong Skippable Condition

As accumulated column values in sumcheck will be in general unknown, a way to ensure that a skippable condition guarantees that all sub-relations will be satisfied is to choose a condition which algebraically implies that all sub-relations will be zero. Typically, if
each sub-relation is of the form $sel \cdot (\ldots) = 0$ then setting $sel == 0$ as "skippable" condition does the job. Similarly, for a list of boolean selectors $sel_1,\ldots sel_n$ and sub-relations of the form
$$sel_1 \cdot (\ldots) = 0$$
$$sel_2 \cdot (\ldots) = 0$$
$$ \ldots $$
$$sel_n \cdot (\ldots) = 0$$

a "skippable" condition can be picked as
$$ sel_1 + sel_2 + \cdots sel_n == 0$$
We name such a condition "strong" and show in next section that this can be relaxed.

## Valid Relaxed Skippable Condition

At each round of the sumcheck protocol, two contiguous rows are "merged".
For each column, the merging step consists in computing the following based on a challenge $\alpha$ (random value over FF):
$$ ColMerged{_i} = (1 - \alpha) \cdot Col_i + \alpha \cdot Col_{i+1} $$

for every even i ($Col_i$ denotes the ith row element of $Col$).
Then, each "merged value" is evaluated in your sub-relation.
Note that $ColMerged_i$ is more or less random except when $Col_i$ and $Col_{i+1}$ are zeros.
Assume that for a given sub-relation all $ColMerged_i$ are "random" except for the term satisfying the skippable condition. Then it will evaluate to zero and can be effectively skipped. (Assuming the strong definition of skippable where the skippable condition can nullify a sub-relation no matter what are the other values.)
Now, one can leverage on the fact that we are using our witness generator to use the skippable in a more generous manner by taking advantage of columns that are guaranteed to be zero whenever the skippable condition is true and that this specific column being zero nullifies a sub-relation (in other words the column entry is a multiplicative factor of the sub-relation).
Let us take an example of a subtrace with two subrelations over columns $a$, $b$, $c$:

$$
a \cdot (b + c) = 0
$$

$$
b \cdot (1 - b) = 0
$$

Skippable condition $a == 0$.
Strictly speaking, the skippable condition does not algebraically nullify the second equation ($b$ is almost a free variable).
However, if we know that our witness generator will always set $b = 0$ whenever $a == 0$, then we are fine. Namely, for every pair of contiguous rows with skippable condition being satisfied, the merged row will be skippable. For these two rows, we know that $b == 0$ and that the merged row entry will be zero as well. Therefore, contribution for the second sub-relation can be skipped.

WARNING: If $a == 0$ would imply $b == 1$, this would not work even though $b == 1$ satisfy the second relation. Namely, after merging two rows, $b$ would be randomized and the second relation would not be satisfied but the merged $a$ value would be zero and wrongly satisfy the skippable condition.

## Special Case with First Row and Empty Sub-trace

We discuss another little optimization specific to the very first row which is mostly empty when we use sub-relations involving shifted values. Usually, the activation selector $sel$ is not set for this row but the fixed selector "precomputed.first_row" is active.

Assume that our sub-trace is empty (except the first fixed row) i.e., 'sel == 0' for every row. It would be desirable to be able to use the standard skippable condition $sel == 0$. This is possible if $sel' == 0$ and $sel == 0$ guarantee to nullify
all sub-relations.

The reason is that the skippable mechanism applies simultaneously over the two contiguous rows which will be merged. In other words, the contribution will be skipped if the skippable condition holds on both rows. For the skippable condition
$sel == 0$, this means that if the second row is skippable the first row must have $sel' == 0$. As the very first row is merged with the second one in the first round, this applies.

If the skippable mechanism were not simultaneous over the two rows then the first row might have been discarded wrongly.

As an example from memory.pil:

$(1 - precomputed.firstRow) * (1 - sel) * sel' = 0;$

Even if "precomputed.first_row" becomes randomized, we can rely on $sel'$ to nullify this sub-relation. Therefore, $sel == 0$ is a valid skippable condition.

## Leveraging Contiguous Trace

Our trace generation always create some contiguous trace, i.e., as soon as a row is inactive ($sel == 0), the next row is inactive. We can leverage this property when working with the skippable condition.

Example from bitwise.pil:

$(op_{id'} - op_{id}) * (1 - last) = 0;$

We know that our trace generation will fill $op_{id} == 0$ on inactive rows and we can deduce from trace continuity that $op_{id'} == 0$ and therefore this relation will be nullified whenever the skippable condition $sel == 0$ holds.

## TLDR

Due to the randomization of non-zero elements by merging two rows, we emphasize that the only skippable conditions which make sense are enforcing some column values to be zero such as $sel = 0$ or $sel_{1} + sel_{2} + ... = 0$. The latter should only be used when the trace generation enforces that $sel_{i} == 0$ for all $i$'s in order to satisfy this condition. This is the case for boolean selectors.
