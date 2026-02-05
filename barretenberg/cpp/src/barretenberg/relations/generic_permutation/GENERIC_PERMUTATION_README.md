# Generic Log-Derivative Permutation

The file `generic_permutation_relation.hpp` implements a generic log-derivative permutation argument. The relation `GenericPermutationRelationImpl` is the specialization of `GenericLookupRelationImpl` to the case in which all read counts are equal to $1$.

More precisely, the general log-derivative expression used by `GenericLookupRelationImpl`

$$\sum_i \left[ q_{L,i} \cdot \frac{1}{L_i} - c_i \cdot q_{T,i} \cdot \frac{1}{T_i} \right] = 0$$

is specialized to:

$$\sum_i \left[ q_{L,i} \cdot \frac{1}{L_i} - q_{T,i} \cdot \frac{1}{T_i} \right] = 0$$

If the relation is satisfied it means that all the table terms have been looked up exactly once, i.e. $\{ L_i \} = \{ T_i \}$ lookup and table terms are permutations of each other.
