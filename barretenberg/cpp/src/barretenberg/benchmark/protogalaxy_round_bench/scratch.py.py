L = [5678, 6806, 5779, 2350]
total = sum(L)
print(total)
print([int(100 * l / total) for l in L])