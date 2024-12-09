import re


def parse_op(line: str) -> str:
    # VAR1 = OP VAR2 ... ALMOST ALWAYS!
    # only with return var doesnt work
    t = line.split(' ')
    if len(t) == 2:
        return t[0]
    return t[2]


def not_call(line: str) -> str:
    # VARIABLE one should be defined
    # v13 = not v12, without fields, only for one-bits
    names = line.split(' ')
    vars = (names[0], names[3])
    return f'auto {vars[0]} = {vars[1]} ^ smt_terms::BVConst("1", &solver, 10);'


def add_call(line: str) -> str:
    # v17 = add v16, v15 always like this
    line = line.replace(",", "")
    names = line.split(' ')
    vars = (names[0], names[3], names[4])
    return f"auto {vars[0]} = {vars[1]} + {vars[2]};"


def array_get_call(line: str) -> str:
    # v12 = array_get v9, index Field 63 -> u1
    # we take it from little endian
    # so getting by index 63 is VAR & (2 ** 63)
    line = line.replace(",", "")
    names = line.split(' ')
    vars = (names[0], names[3], names[6])
    index = int(vars[2])
    mask = f'smt_terms::BVConst("{2**index}", &solver, 10)'
    return f"auto {vars[0]} = {vars[1]} & {mask};"


def mul_call(line: str) -> str:
    # v16 = mul Field 2, v14
    # v18 = mul v17, v17
    # v19 = mul v18, Field 2
    # so we have 3 cases
    line = line.replace(",", "")
    names = line.split(' ')
    if len(names) == 5:
        # case v18 = mul v17, v17
        vars = (names[0], names[3], names[4])
    elif names[3] == 'Field':
        # case v16 = mul Field 2, v14
        vars = (names[0], names[5], 'smt_terms::BVConst("2", &solver, 10)')
    elif names[4] == 'Field':
        # case v19 = mul v18, Field 2
        vars = (names[0], names[3], 'smt_terms::BVConst("2", &solver, 10)')
    else:
        raise ValueError("Something strange with mul call", line)

    return f"auto {vars[0]} = {vars[1]} * {vars[2]};"


def truncate_call(line: str) -> str:
    # v651 = truncate v650 to 64 bits, max_bit_size: 254
    line = line.replace(",", "")
    names = line.split(' ')
    vars = (names[0], names[3], names[5])
    t = 2 ** int(vars[2]) - 1
    return f'auto {vars[0]} = {vars[1]} & smt_terms::BVConst("{t}", &solver, 10);'


def cast_call(line: str) -> str:
    # v641 = cast v639 as Field
    # type doesnt matter i think
    line = line.replace(",", "")
    names = line.split(' ')
    vars = (names[0], names[3])
    return f'auto {vars[0]} = {vars[1]};'


def lt_call(line: str) -> str:
    # in shl it ignored i dont know how it works
    # in shr it used for multiplying result 
    # if it shift >= 64 result multiplied by 0
    # but it should be 0 itself...
    # so i leave it equal to 1
    line = line.replace(",", "")
    names = line.split(' ')
    vars = (names[0], )
    return f'auto {vars[0]} = smt_terms::BVConst("{1}", &solver, 10);'


def call_call(line: str) -> str:
    # v9 = call to_le_bits(v7) -> [u1; 64]
    line = line.replace(",", "")
    names = line.split(' ')
    name_in_func = re.findall(
            r'to_le_bits\((.*)\)', names[3]
    )[0]
    vars = (names[0], name_in_func)
    return f'auto {vars[0]} = {vars[1]};'


def return_call(line: str) -> str:
    # return v652
    line = line.replace(",", "")
    names = line.split(' ')
    vars = (names[1], )
    return f'auto cr = {vars[0]};'


MAPPING = {
    "add": add_call,
    "array_get": array_get_call,
    "call": call_call,
    "cast": cast_call,
    "lt": lt_call,
    "mul": mul_call,
    "not": not_call,
    "truncate": truncate_call,
    "return": return_call
}


def generate_by_line(line: str) -> str:
    op = parse_op(line)
    # throws expcetion on unknown op
    return MAPPING.get(op, None)(line)


def parse_formatted_ssa(ssa: str) -> str:
    # starts with acir(inline) fn main f0 {
    #               b0(v0: u64, v1: u8):
    # so skip first two lines
    # ends with }, skipping last line
    ssa_lines = ssa.split('\n')[2:-1]
    cpp_generated_lines = []
    for ssa_line in ssa_lines:
        cpp_generated_lines.append(
                generate_by_line(ssa_line.strip())
        )
    return '\t' + '\n\t'.join(cpp_generated_lines)


def main():
    with open('./shl.ssa', 'r') as f:
        ssa = f.read()
    
    with open('./shl.cpp', 'w') as f:
        f.write(parse_formatted_ssa(ssa))

    with open('./shr.ssa', 'r') as f:
        ssa = f.read()
    
    with open('./shr.cpp', 'w') as f:
        f.write(parse_formatted_ssa(ssa))



if __name__ == "__main__":
    main()
