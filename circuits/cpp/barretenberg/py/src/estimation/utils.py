from math import log2

def print_circuit_data(msg, circuit, native_msm):
    print(msg)
    print(f"  log_n:          {circuit.log_n}")
    if native_msm:
        msm_time = sum([msm.time_native() for msm in circuit.verifier_msms])
    else:
        msm_time = sum([msm.time_non_native()
                        for msm in circuit.verifier_msms])
    print(f"  max memory:     {circuit.max_memory} KiB")
    print(f"  time to verify: {msm_time} ms")
    proof_size = circuit.proof_size
    print(f"  proof_size:     {proof_size} B")

def log_circuit_data(lists, circuit, native_msm):
    if native_msm:
        msm_time = sum([msm.time_native() for msm in circuit.verifier_msms])
    else:
        msm_time = sum([msm.time_non_native()
                        for msm in circuit.verifier_msms])
    datum = [circuit.log_n, msm_time, circuit.max_memory, circuit.proof_size]
    lists.append(datum)


def get_circuit_size(num_gates):
    return 1 + int(log2(num_gates))

def info(input):
    print(input)