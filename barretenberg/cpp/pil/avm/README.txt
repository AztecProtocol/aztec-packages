This folder contains PIL relations for the AVM.

Applied heuristic to assess the cost of a relation is given below.
This will be used to determine whether it is worth to merge some
relations into one.

N_mul = number of mulitplication in the relation
N_add = number of additions/subtraction in the relation
deg = degree of the relation (total degree of the polynomial)

Relation cost: degree * (N_mul + N_add/4)

Remark: For edge case, we prefer keep a good readability rather than merging.

Future: There is an optimization in sumcheck protocol allowing to skip some
        rows for relations which are not enabled for them. However, this is
        not yet enabled for the AVM. This might change the decision on whether
        some relations should be merged or not.