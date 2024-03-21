#!/bin/env python3
"""
Strategy:
1. Reimplement multiplication for 9 limbs programmatically
2. Implement reduction for 9 limbs
3. Try basic karatsuba
4. Try 3-limb version
5. Try recursive 3-limb version
6. Check squaring
"""
import math
import string
def convert_a_limbs_into_b_limbs(array_name,new_array_name, original_limb_bits,new_limb_bits,num_original_limbs):
    # Calculate how many new limbs there are
    num_new_limbs=math.ceil((num_original_limbs*original_limb_bits)/new_limb_bits)
    limbs=[]

    # For each new limb
    for i in range(num_new_limbs):
        # Calculate its start index
        start=i*new_limb_bits
        # And end
        end=(i+1)*new_limb_bits
        # If the end goes past the number of bits we have from original bits, chop it off
        if end>(num_original_limbs*original_limb_bits):
            end=num_original_limbs*original_limb_bits

        # If the start and end fall into the same original limb, it's easier
        if ((start//original_limb_bits)==((end-1)//original_limb_bits)):
            original_limb_index_1=start//original_limb_bits
            # Compute the shift for original limb
            shift=start-(original_limb_index_1*original_limb_bits)
            # Do the shift as needed and apply an appropriate mask
            if shift==0:
                limbs.append(f"{array_name}[{original_limb_index_1}] & {hex((1<<new_limb_bits)-1)}")
            else:
                limbs.append(f"({array_name}[{original_limb_index_1}] >> {shift}) & {(hex((1<<new_limb_bits)-1))}")
        else:
            # In this case we need to construct the new limb from several original ones
            original_limb_index_1=start//original_limb_bits
            # Get the shift and mask of the first one
            shift=start-(original_limb_index_1*original_limb_bits)
            mask_1 = original_limb_bits-shift

            # If we don't get chopped off automatically, we need to apply a mask
            if (end < (original_limb_bits*num_new_limbs)):
                original_limb_index_2=end//original_limb_bits
                mask_2 = new_limb_bits-mask_1
                limbs.append(f"(({array_name}[{original_limb_index_1}] >> {shift}) & {(hex((1<<mask_1)-1))}) | (({array_name}[{original_limb_index_2}] & {(hex((1<<mask_2)-1))}) << {mask_1})")
            else:
                limbs.append(f"(({array_name}[{original_limb_index_1}] >> {shift}) & {(hex((1<<mask_1)-1))})")

    new_structure=f"uint64_t {new_array_name}[{num_new_limbs}] = {{ {(','+chr(0xa)+chr(9)).join(limbs)} }};"
    return new_structure

def initialize_mask(limb_bits):
    return f"constexpr uint64_t mask = {hex((1<<limb_bits)-1)};"

def initialize_variables_for_grade_school_multiplication(name_prefix, num_limbs):
    return '\n'.join([f"uint64_t {name_prefix}_{i} = 0;" for i in range(num_limbs*2)])

def initialize_r_inv(num_limb_bits):
    return f"constexpr uint64_t r_inv = T::r_inv & mask;"; 

def grade_school_product(left_argument_prefix,right_argument_prefix,intermediate_result_prefix, num_limbs):
    accumulation_actions=[]
    for i in range(num_limbs):
        for j in range (num_limbs):
            accumulation_actions.append(f"{intermediate_result_prefix}_{i+j} += {left_argument_prefix}[{i}] * {right_argument_prefix}[{j}];")
    return '\n'.join(accumulation_actions)

def reduce_one_limb(result_prefix,modulus_prefix,start_index,num_limb_bits,num_limbs, first_call=False):
    actions=[]
    if (first_call):
        actions.append(f"uint64_t k;")
    actions.append(f"k = ({result_prefix}_{start_index} * r_inv) & mask;")
    for i in range(num_limbs):
        if i==1:
            actions.append(f"{result_prefix}_{start_index+i} += k * {modulus_prefix}[{i}] + ({result_prefix}_{start_index+i-1} >> {num_limb_bits});")
        else:
            actions.append(f"{result_prefix}_{start_index+i} += k * {modulus_prefix}[{i}];")
    return '\n'.join(actions)

def reduce_relaxed(result_prefix,num_limb_bits,num_limbs):
    return '\n'.join([f"{result_prefix}_{num_limbs+i+1} += {result_prefix}_{num_limbs+i} >> {num_limb_bits};"+"\n"+f"{result_prefix}_{num_limbs+i} &= mask;" for i in range(num_limbs-1)])

def accumulate_into_result(limb_name_array, num_original_limbs, num_original_bits, num_new_limbs, num_new_bits,total_bit_length):
    new_limbs=[list([]) for i in range(num_new_limbs)]
    for i in range(num_original_limbs):
        current_index=i*num_original_bits
        start_index=current_index
        end_index=(i+1)*num_original_bits
        if end_index>total_bit_length:
            end_index=total_bit_length
        while current_index<end_index:
            target_limb_index=current_index//num_new_bits
            offset_within_target_limb=current_index%num_new_bits
            original_limb_shift_needed=start_index!=current_index
            if (original_limb_shift_needed):
                if (offset_within_target_limb==0):
                    new_limbs[target_limb_index].append(f"({limb_name_array[i]} >> {current_index-start_index })")
                else:
                    new_limbs[target_limb_index].append(f"(({limb_name_array[i]} >> {current_index-start_index }) << {offset_within_target_limb})")
                current_index+=min(end_index-current_index,num_new_bits-offset_within_target_limb)
            else:
                new_limbs[target_limb_index].append(f"({limb_name_array[i]} << {offset_within_target_limb})")

                current_index += min(end_index-current_index,num_new_bits-offset_within_target_limb)
    return "return {\n"+',\n'.join([' | '.join(new_limbs[i]) for i in range(num_new_limbs)])+ " };"

        
        


if __name__=="__main__":
    original_limb_size=64
    new_limb_size=29
    num_original_limbs=4
    num_new_limbs=9
    wasm_modulus_initialization="constexpr "+convert_a_limbs_into_b_limbs("modulus.data","wasm_modulus",original_limb_size,new_limb_size,num_original_limbs)
    left_initialization=convert_a_limbs_into_b_limbs("data","left",original_limb_size,new_limb_size,num_original_limbs)
    right_initialization=convert_a_limbs_into_b_limbs("other.data","right",original_limb_size,new_limb_size,num_original_limbs)
    print (wasm_modulus_initialization.replace("=",''))
    print (left_initialization)
    print (right_initialization)
    print (initialize_mask(new_limb_size))
    print (initialize_r_inv(new_limb_size))
    print (initialize_variables_for_grade_school_multiplication("temp",num_new_limbs))
    print (grade_school_product("left","right","temp",num_new_limbs))
    for i in range(num_new_limbs):
        print(reduce_one_limb("temp","wasm_modulus",i,new_limb_size,num_new_limbs,i==0))
    print (reduce_relaxed("temp",new_limb_size,num_new_limbs))
    print(accumulate_into_result([f"temp_{num_new_limbs+i}" for i in range(num_new_limbs)],num_new_limbs,new_limb_size,num_original_limbs,original_limb_size,254))

