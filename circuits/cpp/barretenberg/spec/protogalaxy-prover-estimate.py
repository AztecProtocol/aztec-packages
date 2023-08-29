from itertools import combinations_with_replacement
from math import comb

MUL_TO_SEC = 20 / 1_000_000_000 # sec/mul
ADDS_TO_SEC = 2.5 / 1_000_000_000 # sec/mul
BYTES_PER_ELT = 32
BYTES_PER_MiB = 2**20

d = 5

def naive(k, n):
    return n * (2*d-1) * (k * d + 1) * (k + 1)**d

def precompute(k, n):
    return (k + 1) * d * n * (k+1)**d

def middle_path(k, n):
    return (d**2 * k + 2*d -1) * n * (k+1)**d

def lagrange_storage_cost(k):
    overcount= (k+1)**d
    count = comb(k+d,d)
    return count, (k*d+1) * count * BYTES_PER_ELT / BYTES_PER_MiB

def worst_case_barycentric(k,n):
    return n * (d * k * (d - 1)* 6 * (k + 1) 
                + (d - 1) * (k * d + 1))

if __name__=="__main__":
    for log_n in range(14, 18):
        n = 1 << log_n
        # print()
        # print(f"### n = {n}")
        # print()
        # print(f"| $k$  | time on `Fr` muls (s), $n={n}$, Naive|" )
        # print(" | ---- | ------------------------------------- |" )
        # for log_kplus1 in range(1, 8):
        #     k = 2**log_kplus1-1
        #     result = round(naive(k, n) * MUL_TO_SEC, 2)
        #     print(f"|{k}|{result}|")

        # print()
        # print(f"| $k$  | time on `Fr` muls (s), $n={n}$, Precompute|" )
        # print("| --- | -------------------------------- |" )
        # for log_kplus1 in range(1, 8):
        #     k = 2**log_kplus1-1
        #     result = round(precompute(k, n) * MUL_TO_SEC, 2)
        #     print(f"|{k}|{result}|")

        # print()
        # print(f"| $k$  | time on `Fr` muls (s), $n={n}$, Middle Path|" )
        # print("| --- | -------------------------------------- |" )
        # for log_kplus1 in range(1, 8):
        #     k = 2**log_kplus1-1
        #     result = round(middle_path(k, n) * MUL_TO_SEC, 2)
        #     print(f"|{k}|{result}|")
        # print()

        print()
        print(f"| $k$  | time on `Fr` muls (s), $n={n}$, Worst case barycentric|" )
        print("| --- | -------------------------------------- |" )
        for log_kplus1 in range(1, 5):
            k = 2**log_kplus1-1
            result = round(worst_case_barycentric(k, n) * MUL_TO_SEC, 2)
            print(f"|{k}|{result}|")
        print()
