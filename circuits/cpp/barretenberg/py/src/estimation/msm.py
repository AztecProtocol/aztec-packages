class MSM:
    def __init__(self, length):
        self.length = length

    def num_gates_native(self):
        return 960 * self.length

    def num_gates_non_native(self):
        return 22000 + 4000 * self.length

    def num_gates_eccvm(self):
        return 3 + 2 * self.length

    def num_gates_translator(self):
        return 300 + 2 * self.length

    def time_native(self):
        return 1 * self.length

    def time_non_native(self):
        return 286 + 43 * self.length


if __name__ == "__main__":
    for i in range(1, 20):
        msm = MSM(i)
        print(msm.num_gates_non_native() // msm.num_gates_native())

    # MSMs account for 97% of the comutation time
    timings = [0, 1, 9, 5, 10, 9, 0, 2, 0, 0, 0, 385, 852, 144]
    total = sum(timings)
    print(sum([(100 * time // total) for time in timings]))
