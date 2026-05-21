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
    // (a - b) mod p, branch-free, in two limb-passes. a, b in [0, p).
    // bigint_sub yields a - b directly in [0, p) when a >= b (borrow 0).
    // When a < b it wraps to a - b + 2^260 and returns borrow 1; the
    // canonical result is then a - b + p in (0, p), so p is added back —
    // masked by the borrow and folded into a single add pass. That add's
    // carry-out is the discarded 2^260 wrap term. The select keeps it
    // branch-free; a == b gives res 0, borrow 0, no correction.
    var res: BigInt;
    let borrow = bigint_sub(a, b, &res);
    var p: BigInt = get_p();
    var out: BigInt;
    var carry: u32 = 0u;
    for (var j: u32 = 0u; j < NUM_WORDS; j = j + 1u) {
        let pj = select(0u, p.limbs[j], borrow == 1u);
        let c = res.limbs[j] + pj + carry;
        out.limbs[j] = c & MASK;
        carry = c >> WORD_SIZE;
    }
    return out;
}
