#!/usr/bin/python3
import re

def convert(s):
    shift=29*9-256
    modulus=0
    r_squared_orignal=0
    cube_root_original=0
    primitive_root_original=0
    coset_generator_parts=[]
    for i in range (4):
        modulus|=int(re.findall(r'(?<=modulus_'+str(i)+' = )0x[0-9a-fA-F]+(?=UL)',s)[0],16)<<(i*64)
        try:
            r_squared_orignal|=int(re.findall(r'(?<=r_squared_'+str(i)+' = )0x[0-9a-fA-F]+(?=UL)',s)[0],16)<<(i*64)
        except:
            r_squared_orignal|=int(re.findall(r'(?<=r_squared_'+str(i)+' = )\d+',s)[0],10)<<(i*64)

        cube_root_original|=int(re.findall(r'(?<=cube_root_'+str(i)+' = )0x[0-9a-fA-F]+(?=UL)',s)[0],16)<<(i*64)
        try:
            primitive_root_original|=int(re.findall(r'(?<=primitive_root_'+str(i)+' = )0x[0-9a-fA-F]+(?=UL)',s)[0],16)<<(i*64)
        except:
            pass
        current_generator_array=[int(x.replace('ULL','').strip(),16)  for x in re.findall(r'(?<=coset_generators_'+str(i)+'\[8\].)[\s0-9a-fA-FUxL,]+',s)[0].split(",") if len(x.replace('ULL','').strip())>2]
        if (len(current_generator_array)==0):
            current_generator_array=[int(x.replace('ULL','').strip(),16)  for x in re.findall(r'(?<=coset_generators_'+str(i)+'\[8\].)[\s0-9a-fA-FUxL,]+',s)[0].split(",") if len(x.replace('ULL','').strip())>0]
        print (current_generator_array)
        coset_generator_parts.append(current_generator_array)

    print (hex(modulus))
    print (hex(r_squared_orignal))
    print (hex(cube_root_original))
    r_squared_new=(1<<(shift*2))*r_squared_orignal%modulus
    cube_root_new=(1<<(shift))*cube_root_original%modulus
    primitive_root_new=(1<<(shift))*primitive_root_original%modulus
    for i in range(8):
        generator=0
        for j in range(4):
            generator|=coset_generator_parts[j][i]<<(j*64)
        new_generator = (1<<shift)*generator%modulus
        for j in range(4):
            coset_generator_parts[j][i]=(new_generator>>(j*64))&((1<<64)-1)
    for i in range(4):
        print (f'static constexpr uint64_t r_squared_wasm_{i} = 0x{(r_squared_new>>(i*64))&((1<<64)-1):016x}UL;')
    print()
    for i in range(4):
        print (f'static constexpr uint64_t cube_root_wasm_{i} = 0x{(cube_root_new>>(i*64))&((1<<64)-1):016x}UL;')

    print()
    for i in range(4):
        print (f'static constexpr uint64_t primitive_root_wasm_{i} = 0x{(primitive_root_new>>(i*64))&((1<<64)-1):016x}UL;')
    print ()
    for i in range(4):

        print (f'static constexpr uint64_t coset_generators_wasm_{i}[8] ={{ {", ".join(["0x%016xULL"% x for x in coset_generator_parts[i]])} }};')
