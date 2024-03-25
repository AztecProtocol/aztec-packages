#!/bin/env python3
import math
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

def one_level_karatsuba_product(left_argument_prefix,right_argument_prefix,intermediate_result_prefix, num_limbs):
    accumulation_actions=[]
    accumulation_actions.append("uint64_t karatsuba_low;")
    accumulation_actions.append("uint64_t karatsuba_high;")
    accumulation_actions.append("uint64_t left_sum;")
    for i in range(num_limbs//2):
        accumulation_actions.append(f"uint64_t right_sum_{i};")
    for i in range(num_limbs//2):
        accumulation_actions.append(f"left_sum = ({left_argument_prefix}[{i*2}] + {left_argument_prefix}[{i*2+1}]);")
        for j in range (num_limbs//2):
            if (i==0):
                accumulation_actions.append(f"right_sum_{j} = ({right_argument_prefix}[{j*2}] + {right_argument_prefix}[{j*2+1}]);")
            accumulation_actions.append(f"karatsuba_low = {left_argument_prefix}[{i*2}] * {right_argument_prefix}[{j*2}];")
            accumulation_actions.append(f"karatsuba_high = {left_argument_prefix}[{i*2+1}] * {right_argument_prefix}[{j*2+1}];")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j)*2} += karatsuba_low;")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j)*2 + 1} += left_sum * right_sum_{j} - karatsuba_low - karatsuba_high;")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j+1)*2} += karatsuba_high;")
    if num_limbs%2!=0:
        for i in range (num_limbs):
            if i!=(num_limbs-1):
                accumulation_actions.append(f"{intermediate_result_prefix}_{i+num_limbs-1} += {left_argument_prefix}[{i}] * {right_argument_prefix}[{num_limbs-1}];")
                accumulation_actions.append(f"{intermediate_result_prefix}_{i+num_limbs-1} += {left_argument_prefix}[{num_limbs-1}] * {right_argument_prefix}[{i}];")
            else:
                accumulation_actions.append(f"{intermediate_result_prefix}_{i+num_limbs-1} += {left_argument_prefix}[{num_limbs-1}] * {right_argument_prefix}[{num_limbs-1}];")

    return '\n'.join(accumulation_actions)

def one_level_cook_product(left_argument_prefix,right_argument_prefix,intermediate_result_prefix, num_limbs):
    assert(num_limbs%3==0)
    accumulation_actions=[]
    accumulation_actions.append(f"constexpr uint64_t inv_3 = 0x{pow(3,-1,1<<64):016x}UL;")
    for i in range(num_limbs//3):
        for j in range(5):
            accumulation_actions.append(f"uint64_t cook_left_group_{i}_p_{j};")
            accumulation_actions.append(f"uint64_t cook_right_group_{i}_p_{j};")
        accumulation_actions.append(f"cook_left_group_{i}_p_4 = {left_argument_prefix}[{i*3}] + {left_argument_prefix}[{i*3+2}];")
        accumulation_actions.append(f"cook_left_group_{i}_p_0 = {left_argument_prefix}[{i*3}];")
        accumulation_actions.append(f"cook_left_group_{i}_p_1 = cook_left_group_{i}_p_4 + {left_argument_prefix}[{i*3}+1];")
        accumulation_actions.append(f"cook_left_group_{i}_p_2 = cook_left_group_{i}_p_4 - {left_argument_prefix}[{i*3}+1];")
        accumulation_actions.append(f"cook_left_group_{i}_p_3 = ((cook_left_group_{i}_p_2 + {left_argument_prefix}[{i*3}+2]) << 1) - {left_argument_prefix}[{i*3}];")
        accumulation_actions.append(f"cook_left_group_{i}_p_4 = {left_argument_prefix}[{i*3+2}];")
        accumulation_actions.append(f"cook_right_group_{i}_p_4 = {right_argument_prefix}[{i*3}] + {right_argument_prefix}[{i*3+2}];")
        accumulation_actions.append(f"cook_right_group_{i}_p_0 = {right_argument_prefix}[{i*3}];")
        accumulation_actions.append(f"cook_right_group_{i}_p_1 = cook_right_group_{i}_p_4 + {right_argument_prefix}[{i*3}+1];")
        accumulation_actions.append(f"cook_right_group_{i}_p_2 = cook_right_group_{i}_p_4 - {right_argument_prefix}[{i*3}+1];")
        accumulation_actions.append(f"cook_right_group_{i}_p_3 = ((cook_right_group_{i}_p_2 + {right_argument_prefix}[{i*3}+2]) << 1) - {right_argument_prefix}[{i*3}];")
        accumulation_actions.append(f"cook_right_group_{i}_p_4 = {right_argument_prefix}[{i*3+2}];")
    
    for i in range(5):
        accumulation_actions.append(f"uint64_t cook_result_{i};")
    for i in range(3):
        for j in range(3):
            for k in range(5):
                accumulation_actions.append(f"cook_result_{k} = cook_left_group_{i}_p_{k} * cook_right_group_{j}_p_{k};")
            accumulation_actions.append(f"cook_result_3 =  (cook_result_3 - cook_result_1) * inv_3;")
            accumulation_actions.append(f"cook_result_1 =  (cook_result_1 - cook_result_2) >> 1;")
            accumulation_actions.append(f"cook_result_2 =  cook_result_2 - cook_result_0;")
            accumulation_actions.append(f"cook_result_3 =  ((cook_result_2 - cook_result_3) >> 1) + (cook_result_4<<1);")
            accumulation_actions.append(f"cook_result_2 = cook_result_2 + cook_result_1 - cook_result_4;")
            accumulation_actions.append(f"cook_result_1 = cook_result_1 - cook_result_3;")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j)*3} += cook_result_0;")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j)*3 + 1} += cook_result_1;")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j)*3 + 2} += cook_result_2;")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j)*3 + 3} += cook_result_3;")
            accumulation_actions.append(f"{intermediate_result_prefix}_{(i+j)*3 + 4} += cook_result_4;")
            

    return '\n'.join(accumulation_actions)

def grade_school_sqr(left_argument_prefix,intermediate_result_prefix, num_limbs):
    accumulation_actions=[]
    accumulation_actions.append("uint64_t acc;")
    for r in range (num_limbs*2 - 1):
        if r!=0 and r!=(num_limbs-1)*2:
            accumulation_actions.append("acc = 0;")
        for i in range(0,(r+2)//2):
            if (r-i>=num_limbs):
                continue
            if (i==(r-i)):
                accumulation_actions.append(f"{intermediate_result_prefix}_{r} += {left_argument_prefix}[{i}] * {left_argument_prefix}[{i}];")
            else:
                accumulation_actions.append(f"acc += {left_argument_prefix}[{i}] * {left_argument_prefix}[{r-i}];")
        if r!=0 and r!=(num_limbs-1)*2:
            accumulation_actions.append(f"{intermediate_result_prefix}_{r} += (acc<<1);")

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

        
def print_regular_multiplication(original_bits,new_bits,original_limbs,new_limbs):        
    wasm_modulus_initialization="constexpr "+convert_a_limbs_into_b_limbs("modulus.data","wasm_modulus",original_bits,new_bits,original_limbs)
    left_initialization=convert_a_limbs_into_b_limbs("data","left",original_bits,new_bits,original_limbs)
    right_initialization=convert_a_limbs_into_b_limbs("other.data","right",original_bits,new_bits,original_limbs)
    print (wasm_modulus_initialization.replace("=",''))
    print (left_initialization)
    print (right_initialization)
    print (initialize_mask(new_bits))
    print (initialize_r_inv(new_bits))
    print (initialize_variables_for_grade_school_multiplication("temp",new_limbs))
    print (grade_school_product("left","right","temp",new_limbs))
    for i in range(new_limbs):
        print(reduce_one_limb("temp","wasm_modulus",i,new_bits,new_limbs,i==0))
    print (reduce_relaxed("temp",new_bits,new_limbs))
    print(accumulate_into_result([f"temp_{new_limbs+i}" for i in range(new_limbs)],new_limbs,new_bits,original_limbs,original_bits,254))


def print_regular_sqr(original_bits,new_bits,original_limbs,new_limbs):        
    wasm_modulus_initialization="constexpr "+convert_a_limbs_into_b_limbs("modulus.data","wasm_modulus",original_bits,new_bits,original_limbs)
    left_initialization=convert_a_limbs_into_b_limbs("data","left",original_bits,new_bits,original_limbs)
    print (wasm_modulus_initialization.replace("=",''))
    print (left_initialization)
    print (initialize_mask(new_bits))
    print (initialize_r_inv(new_bits))
    print (initialize_variables_for_grade_school_multiplication("temp",new_limbs))
    print (grade_school_sqr("left","temp",new_limbs))
    for i in range(new_limbs):
        print(reduce_one_limb("temp","wasm_modulus",i,new_bits,new_limbs,i==0))
    print (reduce_relaxed("temp",new_bits,new_limbs))
    print(accumulate_into_result([f"temp_{new_limbs+i}" for i in range(new_limbs)],new_limbs,new_bits,original_limbs,original_bits,254))


def print_karatsuba_multiplication(original_bits,new_bits,original_limbs,new_limbs):        
    wasm_modulus_initialization="constexpr "+convert_a_limbs_into_b_limbs("modulus.data","wasm_modulus",original_bits,new_bits,original_limbs)
    left_initialization=convert_a_limbs_into_b_limbs("data","left",original_bits,new_bits,original_limbs)
    right_initialization=convert_a_limbs_into_b_limbs("other.data","right",original_bits,new_bits,original_limbs)
    print (wasm_modulus_initialization.replace("=",''))
    print (left_initialization)
    print (right_initialization)
    print (initialize_mask(new_bits))
    print (initialize_r_inv(new_bits))
    print (initialize_variables_for_grade_school_multiplication("temp",new_limbs))
    print (one_level_karatsuba_product("left","right","temp",new_limbs))
    for i in range(new_limbs):
        print(reduce_one_limb("temp","wasm_modulus",i,new_bits,new_limbs,i==0))
    print (reduce_relaxed("temp",new_bits,new_limbs))
    print(accumulate_into_result([f"temp_{new_limbs+i}" for i in range(new_limbs)],new_limbs,new_bits,original_limbs,original_bits,254))

def print_cook_multiplication(original_bits,new_bits,original_limbs,new_limbs):        
    wasm_modulus_initialization="constexpr "+convert_a_limbs_into_b_limbs("modulus.data","wasm_modulus",original_bits,new_bits,original_limbs)
    left_initialization=convert_a_limbs_into_b_limbs("data","left",original_bits,new_bits,original_limbs)
    right_initialization=convert_a_limbs_into_b_limbs("other.data","right",original_bits,new_bits,original_limbs)
    print (wasm_modulus_initialization.replace("=",''))
    print (left_initialization)
    print (right_initialization)
    print (initialize_mask(new_bits))
    print (initialize_r_inv(new_bits))
    print (initialize_variables_for_grade_school_multiplication("temp",new_limbs))
    print (one_level_cook_product("left","right","temp",new_limbs))
    for i in range(new_limbs):
        print(reduce_one_limb("temp","wasm_modulus",i,new_bits,new_limbs,i==0))
    print (reduce_relaxed("temp",new_bits,new_limbs))
    print(accumulate_into_result([f"temp_{new_limbs+i}" for i in range(new_limbs)],new_limbs,new_bits,original_limbs,original_bits,254))

import sys
if __name__=="__main__":
    original_bits=64
    new_bits=29
    original_limbs=4
    new_limbs=9
    if sys.argv[1]=="--mult":
        print_regular_multiplication(original_bits,new_bits,original_limbs,new_limbs)
    elif sys.argv[1]=="--sqr":
        print_regular_sqr(original_bits,new_bits,original_limbs,new_limbs)
    elif sys.argv[1]=="--karatsuba-mult":
        print_karatsuba_multiplication(original_bits,new_bits,original_limbs,new_limbs)
    elif sys.argv[1]=="--cook-mult":
        print_cook_multiplication(original_bits,new_bits,original_limbs,new_limbs)

