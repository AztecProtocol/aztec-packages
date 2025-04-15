# Some possible improvements

Notes for self.

## Prover

- `commit_sparse` could avoid going through all the rows if we could provide it the set of rows where non-zero elements exist... and the trace object knows that! However, the improvement might not be amazing if `commit_sparse` already only considers the size of the polynomial (which it should) unless the column is mostly 0s and a non-zero elem at the end. Benchmarking should be done before trying this optimization.
- Along the same line of committing, we now use `commit_sparse` which has both performance (likely not much) and memory (might be up to 2x) overhead over just using `commit`. Given that we now use tight polynomials, it might make sense to use just `commit` UNLESS, again, the column is mostly 0s and a non-zero elem at the end. HOWEVER, we could cheaply decide this on the fly using the trace object which can keep the number of non-zero elems, and we use `commit_sparse` if below certain % threshold.
