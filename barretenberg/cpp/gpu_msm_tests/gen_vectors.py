#!/usr/bin/env python3
"""Generate deterministic MSM test vectors with an independent oracle.

Every point is P_i = h_i * G for a known integer h_i, so the expected result of a column is
(sum s_i * h_i mod r) * G, one scalar multiplication.

Usage: gen_vectors.py <bn254|grumpkin> <out_dir>

bn254 writes tiny, mid, window_edge and avm_shaped; grumpkin writes grumpkin_tiny, grumpkin_window_edge
and grumpkin_mid (a smaller mid), all over y^2 = x^3 - 17. The affine formulas below assume a = 0 and
never use b, which holds for both curves.
"""
import random, sys
BN254_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583
BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617
CURVES = {
    # name: (base field p, group order r, generator, b)
    'bn254': (BN254_Q, BN254_R, (1, 2), 3),
    'grumpkin': (BN254_R, BN254_Q, (1, 0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c), -17),
}
p = r = G = None

def dbl(P):
    if P is None: return None
    X, Y, Z = P
    if Y == 0: return None
    A = X*X % p; B = Y*Y % p; C = B*B % p
    D = 2*((X+B)*(X+B) - A - C) % p
    E = 3*A % p; F = E*E % p
    X3 = (F - 2*D) % p
    return (X3, (E*(D-X3) - 8*C) % p, 2*Y*Z % p)

def add(P, Q):
    if P is None: return Q
    if Q is None: return P
    X1, Y1, Z1 = P; X2, Y2, Z2 = Q
    Z1Z1 = Z1*Z1 % p; Z2Z2 = Z2*Z2 % p
    U1 = X1*Z2Z2 % p; U2 = X2*Z1Z1 % p
    S1 = Y1*Z2*Z2Z2 % p; S2 = Y2*Z1*Z1Z1 % p
    if U1 == U2:
        return dbl(P) if S1 == S2 else None
    H = (U2-U1) % p; I = (2*H)**2 % p; J = H*I % p
    rr = 2*(S2-S1) % p; V = U1*I % p
    X3 = (rr*rr - J - 2*V) % p
    return (X3, (rr*(V-X3) - 2*S1*J) % p, ((Z1+Z2)**2 - Z1Z1 - Z2Z2)*H % p)

def mul(k, P):
    k %= r
    R = None
    for bit in bin(k)[2:]:
        R = dbl(R)
        if bit == '1': R = add(R, P)
    return R

def affine(P):
    if P is None: return None
    X, Y, Z = P
    zi = pow(Z, p-2, p)
    return (X*zi*zi % p, Y*zi*zi*zi % p)

def hx(v): return format(v, '064x')

def write(path, hs, cols):
    pts = [affine(mul(h, (G[0], G[1], 1))) if h is not None else None for h in hs]
    with open(path, 'w') as f:
        f.write(f"N {len(pts)}\n")
        for P in pts:
            f.write("inf\n" if P is None else f"{hx(P[0])} {hx(P[1])}\n")
        f.write(f"C {len(cols)}\n")
        for start, scal in cols:
            acc = 0
            for j, s in enumerate(scal):
                h = hs[start+j]
                if h is not None: acc = (acc + s*h) % r
            f.write(f"col {start} {len(scal)}\n")
            for s in scal: f.write(hx(s) + "\n")
            e = affine(mul(acc, (G[0], G[1], 1)))
            f.write("expected inf\n" if e is None else f"expected {hx(e[0])} {hx(e[1])}\n")

def narrow(rng, bits): return rng.getrandbits(bits)

def select_curve(name):
    global p, r, G
    p, r, G, b = CURVES[name]
    assert (G[1] * G[1] - G[0] ** 3 - b) % p == 0, "generator is not on the curve"
    assert mul(r, (G[0], G[1], 1)) is None, "generator order is not r"

def write_grumpkin(out):
    rng = random.Random(0x62A7)
    hs = [1, 2, 3, 3, r-3, None, 5, 7, r-1]
    big = (1 << 200) + 12345
    cols = [(0, []), (2, [1]), (0, [0]*9), (0, [1]*9), (0, [r-1]*9),
            (0, [big, 0, 1, 2, r-1, 99, 0, 3, 1 << 253]), (3, [5, 5, 5, 5, 5, 5]),
            (1, [1 << 128, (1 << 128) - 1, 1 << 64, (1 << 64) - 1, 1, 2, 3, 4]),
            (5, [r-1, 1, 1, 1])]
    write(f"{out}/grumpkin_tiny.txt", hs, cols)
    hs = [rng.getrandbits(64) for _ in range(1100)]
    cols = [(0, [rng.randrange(r) for _ in range(500)]), (1, [rng.randrange(r) for _ in range(301)]),
            (3, [rng.randrange(r) for _ in range(77)])]
    write(f"{out}/grumpkin_mid.txt", hs, cols)
    hs = [rng.getrandbits(64) for _ in range(1600)]
    sc = []
    for k in range(1, 254):
        sc += [(1 << k) - 1, 1 << k, (1 << k) + 1]
    sc = [s % r for s in sc]
    cols = [(0, sc[:700]), (0, sc[700:])]
    write(f"{out}/grumpkin_window_edge.txt", hs[:max(len(sc), 1)], cols)

def main(out):
    rng = random.Random(0xA27EC)
    # tiny: edge cases
    hs = [1, 2, 3, 3, r-3, None, 5, 7, r-1]
    big = (1 << 200) + 12345
    cols = [(0, []), (2, [1]), (0, [0]*9), (0, [1]*9), (0, [r-1]*9),
            (0, [big, 0, 1, 2, r-1, 99, 0, 3, 1 << 253]), (3, [5, 5, 5, 5, 5, 5]),
            (1, [1 << 128, (1 << 128) - 1, 1 << 64, (1 << 64) - 1, 1, 2, 3, 4]),
            (5, [r-1, 1, 1, 1])]
    write(f"{out}/tiny.txt", hs, cols)
    # mid: dense, odd sizes, unaligned starts
    hs = [rng.getrandbits(64) for _ in range(4099)]
    cols = [(0, [rng.randrange(r) for _ in range(1500)]), (1, [rng.randrange(r) for _ in range(1001)]),
            (3, [rng.randrange(r) for _ in range(777)])]
    write(f"{out}/mid.txt", hs, cols)
    # window_edge: scalars around power-of-two and limb boundaries
    hs = [rng.getrandbits(64) for _ in range(1600)]
    sc = []
    for k in range(1, 254):
        sc += [(1 << k) - 1, 1 << k, (1 << k) + 1]
    sc = [s % r for s in sc]
    cols = [(0, sc[:700]), (0, sc[700:])]
    write(f"{out}/window_edge.txt", hs[:max(len(sc), 1)], cols)
    # avm_shaped: many columns, sparse, narrow scalars, duplicate and opposite points
    n = 6000
    hs = []
    for i in range(n):
        u = rng.random()
        if u < 0.05 and hs: hs.append(hs[rng.randrange(len(hs))])
        elif u < 0.08 and hs:
            h = hs[rng.randrange(len(hs))]
            hs.append(None if h is None else (r - h) % r)
        else: hs.append(rng.getrandbits(64) | 1)
    cols = []
    for c in range(40):
        size = min(n, int(2 ** rng.uniform(0, 11.5)))
        start = rng.randrange(0, n - size + 1)
        scal = []
        hot = [rng.randrange(r) for _ in range(3)]
        for _ in range(size):
            u = rng.random()
            if u < 0.5: scal.append(0)
            elif u < 0.75: scal.append(narrow(rng, 8))
            elif u < 0.85: scal.append(narrow(rng, 32))
            elif u < 0.9: scal.append(rng.choice(hot))
            else: scal.append(rng.randrange(r))
        cols.append((start, scal))
    write(f"{out}/avm_shaped.txt", hs, cols)

if __name__ == '__main__':
    select_curve(sys.argv[1])
    if sys.argv[1] == 'grumpkin':
        write_grumpkin(sys.argv[2])
    else:
        main(sys.argv[2])
