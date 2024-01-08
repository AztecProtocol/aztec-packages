def analyze(L):
    total = sum(L)
    print(*enumerate([x / total for x in L]), sep="\n")

raw_p = [162, 529, 545,1125,1495, 163, 492]
raw_h = [13.5, 160, 141,14.9, 340,1152, 884]


print("plonk:")
analyze(raw_p[:-1])
print("honk:")
analyze(raw_h[:-1])