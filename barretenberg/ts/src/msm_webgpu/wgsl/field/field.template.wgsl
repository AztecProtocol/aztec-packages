fn fr_add(a: ptr<function, BigInt>, b: ptr<function, BigInt>) -> BigInt { 
    var res: BigInt;
    bigint_add(a, b, &res);
    return fr_reduce(&res);
}

fn fr_reduce(a: ptr<function, BigInt>) -> BigInt {
    var res: BigInt;
    var p: BigInt = get_p();
    var underflow = bigint_sub(a, &p, &res);
    if (underflow == 1u) {
        return *a;
    }

    return res;
}

fn fr_sub(a: ptr<function, BigInt>, b: ptr<function, BigInt>) -> BigInt {
    // (a - b) mod p, branch-free. a, b in [0, p), so a + p is in [p, 2p):
    // (a + p) - b never underflows and lands in [0, 2p), which fr_reduce
    // folds to [0, p). a == b gives a + p - b = p, and fr_reduce(p) is
    // canonical 0 — so no special-case is needed (the old code needed an
    // explicit a == b short-circuit because its a < b branch produced a
    // non-canonical p). No bigint_gt / bigint_eq, no divergent branch.
    var p: BigInt = get_p();
    var t: BigInt;
    bigint_add(a, &p, &t);
    var res: BigInt;
    bigint_sub(&t, b, &res);
    return fr_reduce(&res);
}
