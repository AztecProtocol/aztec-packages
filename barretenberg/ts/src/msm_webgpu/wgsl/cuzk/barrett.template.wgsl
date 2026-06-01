const W_MASK = {{ w_mask }}u;
const SLACK = {{ slack }}u;

struct BigIntWide {
    limbs: array<u32, {{ num_words_mul_two }}>
}

fn get_mu() -> BigInt {
    var mu: BigInt;
{{{ mu_limbs }}}
    return mu;
}

fn get_p_wide() -> BigIntWide {
    var p: BigIntWide;
{{{ p_limbs }}}
    return p;
}

// Full 32×32 → 64-bit unsigned product as vec2<u32>(.x = low 32, .y = high 32).
// WGSL's `*` on u32 keeps only the low 32 bits, so a limb product overflows once
// WORD_SIZE > 16 (21-bit limbs give a 42-bit product); compute it via a 16-bit split.
fn mul_wide(a: u32, b: u32) -> vec2<u32> {
    let aL = a & 0xffffu; let aH = a >> 16u;
    let bL = b & 0xffffu; let bH = b >> 16u;
    let ll = aL * bL;
    let lh = aL * bH;
    let hl = aH * bL;
    let hh = aH * bH;
    let cross = (ll >> 16u) + (lh & 0xffffu) + (hl & 0xffffu);
    let lo = (ll & 0xffffu) | (cross << 16u);
    let hi = hh + (lh >> 16u) + (hl >> 16u) + (cross >> 16u);
    return vec2<u32>(lo, hi);
}

fn mul(a: ptr<function, BigInt>, b: ptr<function, BigInt>) -> BigIntWide {
    var res: BigIntWide;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        for (var j = 0u; j < NUM_WORDS; j = j + 1u) {
            // Full product limb_i · limb_j (up to 2·WORD_SIZE bits): split its low
            // WORD_SIZE bits into res[i+j] and the high bits into res[i+j+1].
            let c = mul_wide((*a).limbs[i], (*b).limbs[j]);
            res.limbs[i+j] += c.x & W_MASK;
            res.limbs[i+j+1] += (c.x >> WORD_SIZE) | (c.y << (32u - WORD_SIZE));
        }
    }

    // start from 0 and carry the extra over to the next index
    for (var i = 0u; i < 2 * NUM_WORDS - 1; i = i + 1u) {
        res.limbs[i+1] += res.limbs[i] >> WORD_SIZE;
        res.limbs[i] = res.limbs[i] & W_MASK;
    }
    return res;
}

fn sub_512(a: ptr<function, BigIntWide>, b: ptr<function, BigIntWide>, res: ptr<function, BigIntWide>) -> u32 {
    var borrow = 0u;
    for (var i = 0u; i < 2u * NUM_WORDS; i = i + 1u) {
        (*res).limbs[i] = (*a).limbs[i] - (*b).limbs[i] - borrow;
        if ((*a).limbs[i] < ((*b).limbs[i] + borrow)) {
            (*res).limbs[i] += W_MASK + 1u;
            borrow = 1u;
        } else {
            borrow = 0u;
        }
    }
    return borrow;
}

fn get_higher_with_slack(a: ptr<function, BigIntWide>) -> BigInt {
    var out: BigInt;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        out.limbs[i] = (((*a).limbs[i + NUM_WORDS] << SLACK) + ((*a).limbs[i + NUM_WORDS - 1] >> (WORD_SIZE - SLACK))) & W_MASK;
    }
    return out;
}

fn field_mul(a: ptr<function, BigInt>, b: ptr<function, BigInt>) -> BigInt {
    var xy: BigIntWide = mul(a, b);
    var xy_hi: BigInt = get_higher_with_slack(&xy);
    var mu = get_mu();
    var l: BigIntWide = mul(&xy_hi, &mu);
    var l_hi: BigInt = get_higher_with_slack(&l);
    var p = get_p();
    var lp: BigIntWide = mul(&l_hi, &p);
    var r_wide: BigIntWide;
    sub_512(&xy, &lp, &r_wide);

    var r_wide_reduced: BigIntWide;
    var p_wide = get_p_wide();
    var underflow = sub_512(&r_wide, &p_wide, &r_wide_reduced);
    if (underflow == 0u) {
        r_wide = r_wide_reduced;
    }
    var r: BigInt;
    for (var i = 0u; i < NUM_WORDS; i = i + 1u) {
        r.limbs[i] = r_wide.limbs[i];
    }
    return fr_reduce(&r);
}
