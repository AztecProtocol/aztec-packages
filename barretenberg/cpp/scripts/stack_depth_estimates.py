from math import ceil

# Estimates are for kernels processing up to 3 apps
NUM_APP_PER_KERNEL = 3
# Each new databus column adds 4 commitments
NUM_DATABUS_COMMITMENTS = 4
# Databus inputs
NUM_DATABUS_INPUTS_TO_KERNEL = NUM_APP_PER_KERNEL + 1
# Databus entries
NUM_DATABUS_ENTRIES = NUM_DATABUS_INPUTS_TO_KERNEL + 1
# Witness commitments in MegaFlavor: 24 (current) - 12 (databus entries) + databus adjustment
NUM_WITNESS_COMMITMENTS = 12 + NUM_DATABUS_COMMITMENTS * NUM_DATABUS_ENTRIES
# VK commitments in MegaFlavor
NUM_VK_COMMITMENTS = 31
# Num zero commitments in kernels (on average 13)
NUM_ZERO_COMMITMENTS_KERNEL = 13
# Num zero commitments in apps (databus inputs are all zero)
NUM_ZERO_COMMITMENTS_APP = NUM_DATABUS_INPUTS_TO_KERNEL * NUM_DATABUS_COMMITMENTS
# Total commitments
NUM_TOTAL_COMMITMENTS = NUM_WITNESS_COMMITMENTS + NUM_VK_COMMITMENTS
NUM_OPTIMISED_COMMITMENTS_KERNEL = NUM_TOTAL_COMMITMENTS - NUM_ZERO_COMMITMENTS_KERNEL
NUM_OPTIMISED_COMMITMENTS_APP = NUM_TOTAL_COMMITMENTS - NUM_ZERO_COMMITMENTS_APP
# Shifted commitments
NUM_SHIFTED_COMMITMENTS = 5
# Shplonk additional commitments
NUM_ADDITIONAL_SHPLONK_COMMITMENTS = 1 + 1 + 1 + 1 # degree check + shplonk Q + [1] + KZG
# Num wires in MegaBuilder
NUM_WIRES = 4
# Num pairing points in a kernel (num apps + kernel + merge)
NUM_PP_IN_KERNEL = NUM_APP_PER_KERNEL + 1 + 1

ECC_LOG_SIZE = 15
TRANSLATOR_LOG_SIZE = 13

def num_ecc_rows(msm_size: int, short_scalars: bool):
    divisor = 4 if short_scalars else 2
    return ceil(msm_size / divisor) * 33 + 31

def hypernova_folding(is_kernel: bool) -> [int, int]:
    if is_kernel:
        ecc_rows = num_ecc_rows(NUM_OPTIMISED_COMMITMENTS_KERNEL + 1, True) + num_ecc_rows(NUM_SHIFTED_COMMITMENTS + 1, True)
        ultra_ops = NUM_OPTIMISED_COMMITMENTS_KERNEL + 1 + NUM_SHIFTED_COMMITMENTS + 1
        return [ecc_rows, ultra_ops]

    ecc_rows = num_ecc_rows(NUM_OPTIMISED_COMMITMENTS_APP + 1, True) + num_ecc_rows(NUM_SHIFTED_COMMITMENTS + 1, True)
    ultra_ops = NUM_OPTIMISED_COMMITMENTS_APP + 1 + NUM_SHIFTED_COMMITMENTS + 1
    return [ecc_rows, ultra_ops]

def merge() -> [int, int]:
    ecc_rows = num_ecc_rows(NUM_ADDITIONAL_SHPLONK_COMMITMENTS, False)   # Large scalar part
    ecc_rows += num_ecc_rows((NUM_APP_PER_KERNEL + 2) * NUM_WIRES, True) # The short scalars are: new subtables + T_prev + merged table
    ecc_rows -= 31 # Adjust the overhead
    ultra_ops = NUM_ADDITIONAL_SHPLONK_COMMITMENTS + (NUM_APP_PER_KERNEL + 2) * NUM_WIRES

    return [ecc_rows, ultra_ops]

def delayed_merge(num_circuits: int) -> [int, int]:
    # Num circuits tables + merge tables
    # We use large scalars to have fewer hashes
    ecc_rows = num_ecc_rows((num_circuits + 1) * NUM_WIRES + NUM_ADDITIONAL_SHPLONK_COMMITMENTS, False)
    ultra_ops = (num_circuits + 1) * NUM_WIRES + NUM_ADDITIONAL_SHPLONK_COMMITMENTS

    return [ecc_rows, ultra_ops]

def pp_aggregation(num_points: int) -> [int, int]:
    ecc_rows = num_ecc_rows(num_points, True) * 2
    ultra_ops = num_points * 2
    return [ecc_rows, ultra_ops]


def kernel(num_apps: int) -> [int, int]:
    assert(num_apps <= NUM_APP_PER_KERNEL)
    [kernel_folding_rows, kernel_ops] = hypernova_folding(True)
    [app_folding_rows, app_ops] = hypernova_folding(False)
    [merge_rows, merge_ops] = merge()
    [pp_aggregation_rows, pp_aggregation_ops] = pp_aggregation(NUM_PP_IN_KERNEL)

    ecc_rows = num_apps * app_folding_rows + kernel_folding_rows + merge_rows + pp_aggregation_rows
    ultra_ops = num_apps * app_ops + kernel_ops + merge_ops + pp_aggregation_ops

    return [ecc_rows, ultra_ops]

def kernel_delayed_merge(num_apps: int) -> [int, int]:
    assert(num_apps <= NUM_APP_PER_KERNEL)
    [kernel_folding_rows, kernel_ops] = hypernova_folding(True)
    [app_folding_rows, app_ops] = hypernova_folding(False)
    [pp_aggregation_rows, pp_aggregation_ops] = pp_aggregation(NUM_PP_IN_KERNEL - 1)

    ecc_rows = num_apps * app_folding_rows + kernel_folding_rows + pp_aggregation_rows
    ultra_ops = num_apps * app_ops + kernel_ops + pp_aggregation_ops

    return [ecc_rows, ultra_ops]

def total(num_kernels: int, last_kernel_num_apps: int) -> [int, int]:
    [ecc_rows_kernel, ops_kernel] = kernel(NUM_APP_PER_KERNEL)
    [ecc_rows_last_kernel, ops_last_kernel] = kernel(last_kernel_num_apps)

    return [(num_kernels - 1) * ecc_rows_kernel + ecc_rows_last_kernel, (num_kernels - 1) * ops_kernel + ops_last_kernel]

def total_delayed_merge(num_kernels: int, last_kernel_num_apps: int) -> [int, int]:
    [ecc_rows_kernel, ops_kernel] = kernel_delayed_merge(NUM_APP_PER_KERNEL)
    [ecc_rows_last_kernel, ops_last_kernel] = kernel_delayed_merge(last_kernel_num_apps)
    [ecc_rows_batch_merge, ops_batch_merge] = delayed_merge((NUM_APP_PER_KERNEL + 1) * (num_kernels - 1) + last_kernel_num_apps + 1)

    ecc_rows = (num_kernels - 1) * ecc_rows_kernel + ecc_rows_last_kernel + ecc_rows_batch_merge
    ultra_ops = (num_kernels - 1) * ops_kernel + ops_last_kernel + ops_batch_merge


    return [ecc_rows, ultra_ops]

def cmp_list(lhs: [int, int], rhs: [int, int]):
    return lhs[0] < rhs[0] and lhs[1] < rhs[1]

def compute_max_size(ecc_log_size: int, ops_size: int):
    max_rows = 1 << ecc_log_size
    max_ops = 1 << ops_size
    k = 1
    total_rows = 0
    total_ops = 0
    while total_rows < max_rows and total_ops < max_ops:
        k += 1
        [total_rows_, total_ops_] = total(k, NUM_APP_PER_KERNEL)
        total_rows = total_rows_
        total_ops = total_ops_

    final_k = k - 1
    result = NUM_APP_PER_KERNEL * final_k
    if cmp_list(total(final_k, 1), [max_rows, max_ops]):
        result += 1
    elif cmp_list(total(final_k, 2), [max_rows, max_ops]):
        result += 2

    print(f"max app size: {result}")

    total_rows = 0
    total_ops = 0
    while total_rows < max_rows and total_ops < max_ops:
        k += 1
        [total_rows_, total_ops_] = total_delayed_merge(k, NUM_APP_PER_KERNEL)
        total_rows = total_rows_
        total_ops = total_ops_

    final_k = k - 1
    result = NUM_APP_PER_KERNEL * final_k
    if cmp_list(total(final_k, 1), [max_rows, max_ops]):
        result += 1
    elif cmp_list(total(final_k, 2), [max_rows, max_ops]):
        result += 2

    print(f"max app size with delayed merge: {result}")

if __name__ == "__main__":
    compute_max_size(ECC_LOG_SIZE, TRANSLATOR_LOG_SIZE)
