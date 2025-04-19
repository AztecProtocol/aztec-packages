import lldb

class Fr:
    # Define the bn254 modulus
    N = 21888242871839275222246405745257275088548364400416034343698204186575808495617

    # Define R as a power of 2 such that R > N (commonly used R for bn254 is 2^256)
    R = 2**256

    # Compute R inverse modulo N
    R_inv = pow(R, -1, N)

class Fq:
    # Define the bn254 modulus
    N = 21888242871839275222246405745257275088696311157297823662689037894645226208759

    # Define R as a power of 2 such that R > N (commonly used R for bn254 is 2^256)
    R = 2**256

    # Compute R inverse modulo N
    R_inv = pow(R, -1, N)

def from_montgomery(field_type, montgomery_value):
    # Convert from Montgomery form to standard representation
    standard_value = (montgomery_value * field_type.R_inv) % field_type.N
    return standard_value

def from_montgomery_field(field_type, valobj, internal_dict):
    try:
        data = valobj.GetChildMemberWithName('data')
        data_0 = data.GetChildAtIndex(0).GetValueAsUnsigned()
        data_1 = data.GetChildAtIndex(1).GetValueAsUnsigned()
        data_2 = data.GetChildAtIndex(2).GetValueAsUnsigned()
        data_3 = data.GetChildAtIndex(3).GetValueAsUnsigned()

        montgomery_value = (
            data_0 +
            (data_1 << 64) +
            (data_2 << 128) +
            (data_3 << 192)
        )

        standard_value = from_montgomery(field_type, montgomery_value)
        return hex(standard_value)
    except Exception as e:
        return f"Error: {e}"

def from_montgomery_fr(valobj, internal_dict):
    return from_montgomery_field(Fr, valobj, internal_dict)

def from_montgomery_fq(valobj, internal_dict):
    return from_montgomery_field(Fq, valobj, internal_dict)

def from_montgomery_field_t_fr(valobj, internal_dict):
    return from_montgomery_fr(Fr, valobj.EvaluateExpression("get_value()"), internal_dict)

def from_uint256(valobj, internal_dict):
    """Summarize a uint256_t (with a uint64_t[4] named 'data') as hex."""
    try:
        data = valobj.GetChildMemberWithName('data')
        low64  = data.GetChildAtIndex(0).GetValueAsUnsigned()
        mid64a = data.GetChildAtIndex(1).GetValueAsUnsigned()
        mid64b = data.GetChildAtIndex(2).GetValueAsUnsigned()
        high64 = data.GetChildAtIndex(3).GetValueAsUnsigned()

        combined = (
            low64
            | (mid64a << 64)
            | (mid64b << 128)
            | (high64 << 192)
        )
        return hex(combined)
    except Exception as e:
        return f"[uint256_t Error: {e}]"

def __lldb_init_module(debugger, internal_dict):
    commands = [
        # Matches:
        #   "bb::fr",
        #   any optional namespace followed by "Fr" (e.g. "foo::Fr"),
        #   "bb::field<bb::Bn254FrParams>"
        # with or without "const"
        (r'^(const\s+)?(bb::fr|(\w+::)?Fr|bb::field<bb::Bn254FrParams>)$', 'lldb_format.from_montgomery_fr'),

        # Matches:
        #   any optional namespace followed by "Fq" (e.g. "foo::Fq"),
        #   "bb::field<bb::Bn254FqParams>"
        # with or without "const"
        (r'^(const\s+)?((\w+::)?Fq|bb::field<bb::Bn254FqParams>)$', 'lldb_format.from_montgomery_fq'),

        # Matches:
        #   "bb::stdlib::field_t" with any additional characters
        # with or without "const"
        (r'^(const\s+)?(bb::stdlib::field_t.*)$', 'lldb_format.from_montgomery_field_t_fr'),
        ('bb::numeric::uint256_t', 'lldb_format.from_uint256'),
    ]

    for pattern, py_func in commands:
        cmd = f'type summary add -x "{pattern}" --python-function {py_func}'
        debugger.HandleCommand(cmd)

    print('lldb_format.py commands have been installed!')
