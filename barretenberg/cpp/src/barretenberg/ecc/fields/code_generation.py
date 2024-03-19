#!/bin/env python3
import math
import string
def convert_a_limbs_into_b_limbs(array_name,new_array_name, original_limb_bits,new_limb_bits,num_original_limbs):
    num_new_limbs=math.ceil((num_original_limbs*original_limb_bits)/new_limb_bits)
    limbs=[]
    for i in range(num_new_limbs):
        start=i*new_limb_bits
        end=(i+1)*new_limb_bits
        if ((start//original_limb_bits)==(end//original_limb_bits)):
            original_limb_index_1=start//original_limb_bits
            shift=start-(original_limb_index_1*original_limb_bits)
            if shift==0:
                limbs.append(f"{array_name}[{original_limb_index_1}]&{hex((1<<new_limb_bits)-1)}")
            else:
                limbs.append(f"({array_name}[{original_limb_index_1}]>>{shift})&{(hex((1<<new_limb_bits)-1))}")
        else:
            original_limb_index_1=start//original_limb_bits
            shift=start-(original_limb_index_1*original_limb_bits)
            mask_1 = original_limb_bits-shift

            if (end < (original_limb_bits*num_new_limbs)):
                original_limb_index_2=end//original_limb_bits
                mask_2 = new_limb_bits-mask_1
                limbs.append(f"(({array_name}[{original_limb_index_1}]>>{shift})&{(hex((1<<mask_1)-1))})|({array_name}[{original_limb_index_2}]&{(hex((1<<mask_2)-1))})")
            else:
                limbs.append(f"(({array_name}[{original_limb_index_1}]>>{shift})&{(hex((1<<mask_1)-1))})")

    new_structure=f"uint64_t {new_array_name}[{num_new_limbs}] = {{ {(','+chr(0xa)+chr(9)).join(limbs)} }};"
    return new_structure



if __name__=="__main__":
    original_limb_size=64
    new_limb_size=29
    num_original_limbs=4
    wasm_modulus_initialization="constexpr "+convert_a_limbs_into_b_limbs("modulus.data","wasm_modulus",original_limb_size,new_limb_size,num_original_limbs)
    left_initialization=convert_a_limbs_into_b_limbs("data","left",original_limb_size,new_limb_size,num_original_limbs)
    right_initialization=convert_a_limbs_into_b_limbs("other.data","right",original_limb_size,new_limb_size,num_original_limbs)


    print (wasm_modulus_initialization)
    print (left_initialization)
    print (right_initialization)

