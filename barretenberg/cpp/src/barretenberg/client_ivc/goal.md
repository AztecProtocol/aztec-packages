### Goal
Replace the existing `Polynomial<T>` class in UltraHonk with a drop-in, mmap-backed version so we can handle very large polynomials (≤ 2 221 ≈ 2 million coefficients) on mobile devices without blowing the 3-4 GB RAM budget.

### Strict requirements

1. **API-compatible wrapper**
   - Keep the current ctor, `operator[]`, iterators, `size()`, `data()`, etc. so no call-sites change.

2. **mmap storage**
   - Allocate a temp file of `size*sizeof(T)` bytes, `MAP_SHARED | PROT_READ | PROT_WRITE`, then `unlink` it.
   - Fallback to heap if `mmap` is unavailable (e.g. on Windows).

3. **Page-dropping strategy**
   - Dominant access pattern is *sequential forward scans*.
   - Track the current page; once we move **two pages ahead**, issue `madvise(fd_ptr, page_size, MADV_FREE)` (preferred) or `MADV_DONTNEED` to the page two steps behind.
   - This must be transparent to callers but **throw `std::logic_error`** if a caller later jumps back into a freed page (we want bugs loud).

4. **Opt-in build flag**
   - `POLY_MMAP=ON` enables the new code; otherwise we compile the old heap version unchanged.

5. **Resource hygiene**
   - Destructor calls `munmap` and closes the FD.
   - No additional public methods; the wrapper must remain header-only, C++17..

6. **Tests** (gtest style)
   - Forward write + forward read succeeds.
   - Backward seek into a freed page throws.
   - RSS drop demonstration (use `getrusage`, no hard assertion on absolute numbers).
Project TODO list
#	Task	Owner	Notes
1	Draft detailed design for MmapPolynomial (API, paging heuristic, error policy)	🔲
2	Stand-alone prototype; measure RSS for a 2²¹-coefficient poly
4	Implement page-tracking + madvise logic	🔲	Beware page_size alignment
5. unit test

Just do the unit test for now. we will figure out the rest of the refactoring after. We want to run this test and see the resident memory set going down.
