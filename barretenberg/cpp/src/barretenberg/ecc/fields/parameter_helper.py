# coding: utf-8
# A helper script to parse the field parameters from the source code

import os

parameter_files = ['src/barretenberg/ecc/curves/bn254/fq.hpp', 'src/barretenberg/ecc/curves/bn254/fr.hpp',
                   'src/barretenberg/ecc/curves/secp256k1/secp256k1.hpp','src/barretenberg/ecc/curves/secp256r1/secp256r1.hpp']


def get_file_location():
    """
    Returns the current file's location relative to the execution folder.
    
    Returns:
        str: The path to the current file relative to the execution folder.
    """
    return os.path.abspath(__file__)
full_paths=[os.path.join(os.path.join(os.path.dirname(get_file_location()),'../../../../'), file) for file in parameter_files]

print(full_paths)

import re
def parse_field_params(s):
    def parse_number(line):
        """Expects a string without whitespaces"""
        line=line.replace('U','').replace('L','') # Clear away all postfixes
        if line.find('0x')!=-1: # We have to parse hex
            value= int(line,16)
        else:
            value = int(line)
        return value
    
    def recover_single_value(name):
        """Extract a single value from the source code by finding its name, equals sign, and semicolon"""
        nonlocal s
        index=s.find(name)
        if index==-1:
            raise ValueError("Couldn't find value with name "+name)
        eq_position=s[index:].find('=')
        line_end=s[index:].find(';')
        return parse_number(s[index+eq_position+1:index+line_end])        
    
    def recover_single_value_if_present(name):
        """Same as recover_single_value but returns None if the value is not found"""
        nonlocal s
        index=s.find(name)
        if index==-1:
            return None
        eq_position=s[index:].find('=')
        line_end=s[index:].find(';')
        return parse_number(s[index+eq_position+1:index+line_end])   
    
    def recover_array(name):
        """Extract an array of values from the source code by finding its name and contents between braces"""
        nonlocal s
        index = s.find(name)
        number_of_elements=int(re.findall(r'(?<='+name+r'\[)\d+',s)[0])
        start_index=s[index:].find('{')
        end_index=s[index:].find('}')
        all_values=s[index+start_index+1:index+end_index]
        result=[parse_number(x) for (i,x) in enumerate(all_values.split(',')) if i<number_of_elements]
        return result
    
    def recover_multiple_arrays(prefix):
        """Find and extract all arrays with a common prefix (e.g., coset_generators_0, coset_generators_1, etc.)"""
        chunk_names=re.findall(prefix+r'_\d+',s)
        recovered=dict()
        for name in chunk_names:
            recovered[name]=recover_array(name)
        return recovered
    
    def recover_element_from_parts(prefix,shift):
        """Recover a field element from its parts (e.g., modulus_0, modulus_1, etc.)
        Each part is shifted by the appropriate amount and combined"""
        chunk_names=re.findall(prefix+r'_\d+',s)
        val_dict=dict()
        for name in chunk_names:
            val_dict[int(name[len(prefix)+1:])]=recover_single_value(name)
        result=0
        for i in range(len(val_dict)):
            result|=val_dict[i]<<(i*shift)
        return result
    
    def reconstruct_field_from_4_parts(arr):
        """Combine 4 64-bit limbs into a single field element"""
        result=0
        for i, v in enumerate(arr):
            result|=v<<(i*64)
        return result

    parameter_dictionary=dict()
    # Recover the modulus
    parameter_dictionary['modulus']=recover_element_from_parts('modulus',64)
    # Recover r_squared
    parameter_dictionary['r_squared']=recover_element_from_parts('r_squared',64)
    # Recover cube_root in montgomery form (2^256   )
    parameter_dictionary['cube_root']=recover_element_from_parts('cube_root',64)
    # Recover primitive_root in montgomery form (2^256)
    parameter_dictionary['primitive_root']=recover_element_from_parts('primitive_root',64)

    parameter_dictionary['r_inv_x64']=recover_element_from_parts('r_inv',64)
    parameter_dictionary['r_inv_wasm']=recover_element_from_parts('r_inv_wasm',29)
    parameter_dictionary['modulus_wasm']=recover_element_from_parts('modulus_wasm',29)
    parameter_dictionary['r_squared_wasm']=recover_element_from_parts('r_squared_wasm',64)
    parameter_dictionary['cube_root_wasm']=recover_element_from_parts('cube_root_wasm',64)
    parameter_dictionary['primitive_root_wasm']=recover_element_from_parts('primitive_root_wasm',64)
    parameter_dictionary={**parameter_dictionary,**recover_multiple_arrays('coset_generators')}
    parameter_dictionary={**parameter_dictionary,**recover_multiple_arrays('coset_generators_wasm')}
    parameter_dictionary['endo_g1_lo']=recover_single_value_if_present('endo_g1_lo')
    parameter_dictionary['endo_g1_mid']=recover_single_value_if_present('endo_g1_mid')
    parameter_dictionary['endo_g1_hi']=recover_single_value_if_present('endo_g1_hi')
    parameter_dictionary['endo_g2_lo']=recover_single_value_if_present('endo_g2_lo')
    parameter_dictionary['endo_g2_mid']=recover_single_value_if_present('endo_g2_mid')
    parameter_dictionary['endo_minus_b1_lo']=recover_single_value_if_present('endo_minus_b1_lo')
    parameter_dictionary['endo_minus_b1_mid']=recover_single_value_if_present('endo_minus_b1_mid')
    parameter_dictionary['endo_b2_lo']=recover_single_value_if_present('endo_b2_lo')
    parameter_dictionary['endo_b2_mid']=recover_single_value_if_present('endo_b2_mid')

    assert(parameter_dictionary['modulus']==parameter_dictionary['modulus_wasm']) # Check modulus representations are equivalent
    modulus=parameter_dictionary['modulus']
    r_wasm_divided_by_r_regular=2**(261-256)
    assert(parameter_dictionary['r_squared']==pow(2,512,modulus)) # Check r_squared
    assert(parameter_dictionary['r_squared_wasm']==pow(2,9*29*2,modulus)) # Check r_squared_wasm
    assert(parameter_dictionary['cube_root']*r_wasm_divided_by_r_regular%modulus==parameter_dictionary['cube_root_wasm'] or
            parameter_dictionary['cube_root']==0)
    assert(pow(parameter_dictionary['cube_root']*pow(2,-256,modulus),3,modulus)==1 or
            parameter_dictionary['cube_root']==0) # Check cubic root
    assert(pow(parameter_dictionary['cube_root_wasm']*pow(2,-29*9,modulus),3,modulus)==1 or
            parameter_dictionary['cube_root_wasm']==0) # Check cubic root for wasm
    assert(parameter_dictionary['primitive_root']*r_wasm_divided_by_r_regular%modulus==parameter_dictionary['primitive_root_wasm']) # Check pritimitve roots are equivalent
    assert(parameter_dictionary['r_inv_x64']*(1<<64)%parameter_dictionary['modulus']==1)
    assert(parameter_dictionary['r_inv_wasm']*(1<<29)%parameter_dictionary['modulus']==1)
    for i in range(8):
        regular_coset_generator=reconstruct_field_from_4_parts([parameter_dictionary[f'coset_generators_{j}'][i] for j in range(4)])
        wasm_coset_generator=reconstruct_field_from_4_parts([parameter_dictionary[f'coset_generators_wasm_{j}'][i] for j in range(4)])
        assert(regular_coset_generator*r_wasm_divided_by_r_regular%modulus == wasm_coset_generator)

    return parameter_dictionary

def generate_power_of_2_inverse(parameter_dictionary, limb_size):
    """
    Generate the power of 2 inverse for the field modulus.
    
    Args:
        parameter_dictionary (dict): A dictionary containing field parameters.
        limb_size (int): The size of the limbs in bits.
    
    Returns:
        int: The power of 2 inverse for the field modulus.
    """
    modulus=parameter_dictionary['modulus']
    return pow(1<<limb_size,-1,modulus)

def parse_all_files():
    all_params=[]
    for file in full_paths:
        with open(file,'r') as f:
            s=f.read()
            fq_params_found=s.find("FqParams")!=-1
            fr_params_found=s.find("FrParams")!=-1
            if fq_params_found and fr_params_found:
                # Contains both Fq and Fr parameters
                fq_start_index=s.find("FqParams")
                fr_start_index=s.find("FrParams")
                if fq_start_index<fr_start_index:
                    fq_block=s[fq_start_index:fr_start_index]
                    fr_block=s[fr_start_index:]
                else:
                    fr_block=s[fr_start_index:fq_start_index]
                    fq_block=s[fq_start_index:]
                fq_params=parse_field_params(fq_block)
                fr_params=parse_field_params(fr_block)
                all_params.append((file,"FqParams",fq_params))
                all_params.append((file,"FrParams",fr_params))
            elif fq_params_found:
                fq_params=parse_field_params(s)
                all_params.append((file,"FqParams",fq_params))
            elif fr_params_found:
                fr_params=parse_field_params(s)
                all_params.append((file,"FrParams",fr_params))
    return all_params

def convert_to_n_limbs_of_l_bits(value,n,l):
    """Convert a value to n limbs of l bits"""
    limbs=[]
    for i in range(n):
        limbs.append(value&((1<<l)-1))
        value>>=l
    return limbs
def limbs_to_header_string(name,limbs,bool_wasm):
    """Convert a list of limbs to a header string"""
    return '\n\t'+'\n\t'.join([f"static constexpr uint64_t {name}_wasm_{i} = 0x{limbs[i]:x};" if bool_wasm else f"static constexpr uint64_t {name}_{i} = 0x{limbs[i]:x}UL;" for i in range(len(limbs))])


def generate_pow_2_inverse_for_all_files():
    all_params=parse_all_files()
    for file,param_name,params in all_params:
        limb_64_inverse=generate_power_of_2_inverse(params,64)
        limbs_64=convert_to_n_limbs_of_l_bits(limb_64_inverse,4,64)
        header_string=limbs_to_header_string("r_inv",limbs_64,False)
        limb_29_inverse=generate_power_of_2_inverse(params,29)
        limbs_29=convert_to_n_limbs_of_l_bits(limb_29_inverse,9,29)
        header_string+=limbs_to_header_string("r_inv",limbs_29,True)
        short_file=file.split('/')[-1]
        print(f"{short_file} {param_name}:")
        print(header_string)

parse_all_files()
