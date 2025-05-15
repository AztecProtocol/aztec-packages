#include "data_structures.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_randomness();
}

using namespace bb;
using namespace smt_terms;

// --- Basic initialization tests

// Test that tuple is constructed without any issues
TEST(SymbolicTuple, Initialization)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STuple tup({ x, y, z });
    info(tup);
    info(tup.get_sort());
}

// Test Array initialization FF -> FF, from unordered_map
TEST(SymbolicArray, InitMapSTermSTerm)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    std::vector<STerm> indicies = { x, q };
    std::vector<STerm> entries = { q, y };
    SymArray<STerm, STerm> arr(indicies, entries, "Array");
    info(arr);
    arr.print_trace();
}

// Test Array initialization FF -> FF, from vector
TEST(SymbolicArray, InitVecSTerm)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    std::vector<STerm> entries = { q, y };
    SymArray<STerm, STerm> arr(entries, FFConst(1, &s), "Array");
    info(arr);
    arr.print_trace();
}

// Test Array initialization Tuple<FF> -> Tuple<FF>, from unordered_map
TEST(SymbolicArray, InitMapSTupleSTuple)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    STuple t1({ x, y });
    STuple t2({ z, x });
    STuple t3({ q, z });
    STuple t4({ q + z, x });

    std::vector<STuple> indicies = { t1, t2 };
    std::vector<STuple> entries = { t3, t4 };
    SymArray<STuple, STuple> arr(indicies, entries, /*name=*/"Array");
    info(arr);
    arr.print_trace();
}

// Test Array initialization Int -> Tuple<FF>, from vector
TEST(SymbolicArray, InitVecSTuple)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    STuple t1({ x, y });
    STuple t2({ z, x });
    STuple t3({ q, z });
    STuple t4({ q + z, x });

    std::vector<STuple> entries = { t3, t4 };
    SymArray<STerm, STuple> arr(entries, IConst(1, &s), "Array");
    info(arr);
    arr.print_trace();
}

// Test Array initialization Tuple<FF> -> FF, from unordered_map
TEST(SymbolicArray, InitMapSTupleSTerm)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    STuple t1({ x, y });
    STuple t2({ z, x });
    STuple t3({ q, z });
    STuple t4({ q + z, x });

    std::vector<STuple> indicies = { t3, t4 };
    std::vector<STerm> entries = { q, z };
    SymArray<STuple, STerm> arr(indicies, entries, "Array");
    info(arr);
    arr.print_trace();
}

// Test Set initialization { FF }, from vector
TEST(SymbolicSet, InitVecSTerm)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    SymSet<STerm> set({ x, y, z, q }, "Set");
    info(set);
    set.print_trace();
}

// Test Set initialization { Tuple<FF> }, from vector
TEST(SymbolicSet, InitVecSTuple)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    STuple t1({ x, y });
    STuple t2({ z, x });
    STuple t3({ q, z });
    STuple t4({ q + z, x });

    SymSet<STuple> arr({ t1, t2, t3, t4 }, "Set");
    info(arr);
    arr.print_trace();
}

// Test
// - empty set initialization
// - Set insert method
// - Set contains method
TEST(SymbolicSet, Contains)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &slv);
    x == 1;
    STerm y = x + 1;

    SymSet<STerm> set(x.term.getSort(), x.type, &slv, "Set");
    set.insert(x);
    set.insert(y);

    STerm z = FFConst(3, &slv);
    set.not_contains(z);

    set.insert(-x);
    STerm q = 2 * x;
    set.contains(q);

    slv.print_assertions();
    ASSERT_TRUE(slv.check());
}

// --- Advanced tests

// Test an empty Array initialization (Tuple<FF> -> FF) -> FF:
// - we can create an empty array
// - we can pass Symbolic Array as index for another Symbolic Array
// - we can put values in Array
// - we can get vlalues from Array
// Also test the trigger case for printing an array trace
TEST(SymbolicArray, InitSymArraySTerm)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = FFVar("x", &s);
    STerm y = FFVar("y", &s);
    STerm z = x + y;
    STerm q = x * y;

    STuple t1({ x, y });
    STuple t2({ z, x });
    STuple t3({ q, z });
    STuple t4({ q + z, x });

    std::vector<STuple> indicies = { t1, t2, t3 };
    std::vector<STerm> entries = { x, z, q };
    SymArray<STuple, STerm> arr(indicies, entries, "mini_arr");

    cvc5::Sort ind_sort = arr.term.getSort();
    TermType ind_type = arr.type;
    cvc5::Sort entry_sort = x.term.getSort();
    TermType entry_type = x.type;
    SymArray<SymArray<STuple, STerm>, STerm> arrarr(ind_sort, ind_type, entry_sort, entry_type, &s, "BIG_arr");

    arrarr.put(arr, y);
    // this will not print anything related to `arr`
    info(arrarr);
    arrarr.print_trace();

    arrarr.put(arr, arr.get(t1));
    // this will
    info(arrarr);
    arrarr.print_trace();
}

// Example of a somewhat unordinary array use case
// Take an array that maps int -> FF
// Obtain two different solutions to x^2 + y^2 = 50 over integers
// constrain the array entries so we can have a unique solution
TEST(SymbolicArray, SimpleUseCase)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = IVar("x", &slv);
    STerm y = IVar("y", &slv);
    x > 0;
    y > 0;
    x < y;
    STerm z = x * x + y * y;
    STerm q = x * y + y * x;

    STerm a = FFVar("a", &slv);
    STerm b = FFVar("c", &slv);
    STerm c = a * a - b;
    c == 17;

    cvc5::Sort ind_sort = z.term.getSort();
    TermType ind_type = z.type;
    cvc5::Sort entry_sort = c.term.getSort();
    TermType entry_type = c.type;
    // Indicies are ints and entries are FF!
    SymArray<STerm, STerm> arr(ind_sort, ind_type, entry_sort, entry_type, &slv, "Int -> FF");

    arr.put(z, b);
    arr.put(q, a);

    STerm m = IVar("m", &slv);
    STerm n = IVar("n", &slv);
    m > 0;
    n > 0;
    m <= n;

    STerm k = m * m + n * n;
    // 50 = 25 + 25 = 1 + 49
    k == 50;
    z == 50;
    m != x;
    n != y;

    // k was not in the array, but the value is the same
    STerm result = arr[k];
    // In this particular system same as b == -1
    result == bb::fr::neg_one();
    slv.print_assertions();

    ASSERT_TRUE(slv.check());
    ASSERT_EQ(string_to_fr(slv[x], /*base=*/10), bb::fr(1));
    ASSERT_EQ(string_to_fr(slv[y], /*base=*/10), bb::fr(7));
    ASSERT_EQ(string_to_fr(slv[m], /*base=*/10), bb::fr(5));
    ASSERT_EQ(string_to_fr(slv[n], /*base=*/10), bb::fr(5));
    ASSERT_EQ(string_to_fr(slv[a * a], /*base=*/10), bb::fr(16));
}

// Test that we can successfully overwrite values in the array
TEST(SymbolicArray, OverWrite)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    STerm x = BVVar("x", &slv);
    STerm y = BVVar("y", &slv);

    STerm a = IConst(3, &slv);
    STerm b = IConst("4", &slv, /*base=*/10);
    ;

    SymArray<STerm, STerm> table(x.term.getSort(), x.type, a.term.getSort(), a.type, &slv, /*name=*/"rewrite");

    table.put(x, a);
    table.put(y, b);
    x == y;

    STerm z = table[x];

    ASSERT_TRUE(slv.check());
    ASSERT_EQ(string_to_fr(slv[z], /*base=*/10), bb::fr(4));
}

// Test that we can mimic lookup tables functionality using arrays
TEST(SymbolicArray, LookupTable)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    STuple table_idx1({ FFConst("1", &slv), FFConst("2", &slv) });
    STerm table_entry1 = FFConst("3", &slv);

    STuple table_idx2({ FFConst("4", &slv), FFConst("5", &slv) });
    STerm table_entry2 = FFConst("6", &slv);

    SymArray<STuple, STerm> stable({ table_idx1, table_idx2 }, { table_entry1, table_entry2 }, "guess_next");

    STerm x = FFVar("x", &slv);
    STerm y = FFVar("y", &slv);
    STuple entry({ x, y });

    STerm z = stable[entry];
    y - x == 1;
    y + x == 3;

    ASSERT_TRUE(slv.check());

    std::string xval = slv[x];
    ASSERT_EQ(xval, "1");
    std::string yval = slv[y];
    ASSERT_EQ(yval, "2");
    std::string zval = slv[z];
    ASSERT_EQ(zval, "3");
}

// Test that we can mimic lookup tables functionality using sets
TEST(SymbolicSet, LookupTable)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    STuple table_entry1({ FFConst("1", &slv), FFConst("2", &slv), FFConst("3", &slv) });
    STuple table_entry2({ FFConst("4", &slv), FFConst("5", &slv), FFConst("6", &slv) });
    SymSet<STuple> stable({ table_entry1, table_entry2 }, "guess_next");

    STerm x = FFVar("x", &slv);
    STerm y = FFVar("y", &slv);
    STerm z = FFVar("z", &slv);
    STuple entry({ x, y, z });

    stable.contains(entry);
    x != 4;

    ASSERT_TRUE(slv.check());

    std::string xval = slv[x];
    ASSERT_EQ(xval, "1");
    std::string yval = slv[y];
    ASSERT_EQ(yval, "2");
    std::string zval = slv[z];
    ASSERT_EQ(zval, "3");
}