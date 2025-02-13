# Skippable Mechanism

## Introduction

For each sub-trace defined in a .pil file, one can optionally add so-called "skippable" condition which allows to improve performance on prover side whenever the "skippable" condition is satisfied. It basically skips some accumulation computation in sumcheck protocol to all sub-relations pertaining to the sub-trace. More on how to define a valid "skippable" condition in the next section. We emphasize that the "skippable" mechanism does not change the behavior of the verifier and therefore does not present any security risk about soundness, i.e., it does not help a malicious prover to prove a wrong statement even if the "skippable" condition is too relaxed. What can however happen is that the verification fails when it should not (perfect completeness is not guarenteed anymore if we wrongly skip).

## Explanations

A sub-trace contains a list of algebraic sub-relations/equations which must be satisfied. We do not consider lookups nor permutations in this discussion.

A valid "skippable" condition is a condition defined on some columns which guarantee that the accumulation in sumcheck rounds will be zero for this sub-trace, i.e., any sub-relation contribution will be zero. This means that the sub-relation is satisfied with columns values accumulated during sumcheck rounds.

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
For each column, the merging consist in computing the following based on a challenge $\alpha$ (random value over FF):
$$ ColMerged{_i} = (1 - \alpha) \cdot Col_i + \alpha \cdot Col_{i+1} $$

for every even i ($Col_i$ denotes the ith row element of $Col$).
Then, each "merged value" is evaluated in your sub-relation.
Note that $ColMerged_i$ is more or less random except when $Col_i$ and $Col_{i+1}$ are zeros.
Assume that for a given sub-relation all $ColMerged_i$ are "random" except for the term satisfying the skippable condition. Then it will evaluate to zero and can be effectively skipped. (Assuming the strong definition of skippable where the skippable condition can nullify a sub-relation no matter what are the other values.)
Now, one can leverage on the fact that we are using our witness generator to use the skippable in a more generous manner by leveraging columns that are guaranteed to be zero whenever the skippable condition is true and that this particular column being zero nullifies a sub-relation (in other words the column entry is multiplicative factor of the sub-relation).
Let us take an example of a subtrace with two subrelations over columns $a$, $b$, $c$:

$$
a \cdot (b+c) = 0
$$

$$
b \cdot (1- b) = 0
$$

Skippable condition $a == 0$.
Strictly speaking, the skippable condition does not algebraically nullifies the second equation ($b$ is almost a free variable)
However, if we assume that our witness generator will always set $b = 0$ whenever $a== 0$, then we are fine. Namely, for every pair of contiguous rows with skippable condition being satisfied, the merged row will be skippable. For these two rows, we know that $b == 0$ and that the merged row entry will be zero as well. Therefore, contribution for the second sub-relation can be skipped.
