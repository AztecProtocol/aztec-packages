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
    var res: BigInt;

    // Short-circuit a == b to canonical 0. Without this, the "a < b" branch
    // below would return p - (b - a) = p - 0 = p (value 0 mod p but limbs
    // != 0), which breaks is_zero() checks downstream in the EC shaders.
    if (bigint_eq(a, b)) {
        return res; // fresh BigInt, limbs all 0
    }

    var c = bigint_gt(a, b);
    if (c == 0u) { // a < b
        var r: BigInt;
        bigint_sub(b, a, &r);
        var p = get_p();
        bigint_sub(&p, &r, &res);
        return res;
    } else { // a > b
        bigint_sub(a, b, &res);
        return res;
    }
}
