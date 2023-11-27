
import lldb
import re

def simplify_vector_type(type_string):
    simplified_type = re.sub(r"vector<([^,]+), allocator<\1>>", r"\1[]", type_string)
    simplified_type = re.sub(r"RefVector<([^,]+)>", r"\1[]", simplified_type)
    return simplified_type

def shorten_namespace(line):
    # Split the namespace into parts
    line = re.sub(r'(\w+::)+(\w+)', r'\2', line)
    # Keep only the first and last parts for brevity, or the entire namespace if it's short
    return line
def simplify_name(name):
    if name is None:
        return name
    return simplify_vector_type(shorten_namespace(name \
        .replace("barretenberg::field<barretenberg::Bn254FqParams>", "fq") \
        .replace("barretenberg::field<barretenberg::Bn254FrParams>", "fr") \
        .replace("barretenberg::group_elements::affine_element<fq, fr, barretenberg::Bn254G1Params>", "g1") \
        .replace("RefVector<g1_affine_element>", "g1[]")))

RECURSE_LIMIT = 8

def visit_objects(value, func, path=[]):
    """
    Traverses the object structure and applies the given function to each object.
    """
    if func(value, path) or len(path) >= RECURSE_LIMIT:
        return
    # Iterate over all child members of the object
    for i in range(value.GetNumChildren()):
        child = value.GetChildAtIndex(i)
        if child.IsValid():
            visit_objects(child, func, path + [child.GetName()])

highlighted_fields = []

def _get_field(value):
    type_name = value.GetType().GetName()
    if type_name.startswith("barretenberg::field"):
        num = 0
        for i in range(4):
            num += int(value.GetChildMemberWithName("data").GetChildAtIndex(i).GetValue()) * 2**(64*i)
        return num
    return None

def _get_fields(value):
    fields = []
    def visit(subvalue, index):
        field = _get_field(subvalue)
        if field is not None:
            fields.append(field)
    visit_objects(value, visit)
    return fields

def _visit_print_member(value, path):
    """
    Function to print a single member's information.
    """
    print(" " * (len(path)-1) + f"{simplify_name(value.GetName())}:")
    num = value.GetValue() if value.GetValue() is not None else _get_field(value)
    if num is not None:
        print(" " * len(path) + str(num))
        return True

def _visit_print_selected(value, path):
    """
    Function to print a single member's information.
    """
    fields = _get_fields(value)
    if len(fields) == len(highlighted_fields):
        if fields == highlighted_fields:
            tabs = ''
            for part in path[:-1]:
                print(tabs + simplify_name(part))
                tabs += '  '

            visit_objects(value, lambda x, subpath: _visit_print_member(x, path + ["", ""] + subpath))
            return True

def print_members(debugger, command, result, internal_dict):
    """
    Command function to print public members of an object.
    """
    # Retrieve the target object
    frame = debugger.GetSelectedTarget().GetProcess().GetSelectedThread().GetSelectedFrame()
    
    # Evaluate the command to get the object
    value = frame.EvaluateExpression(command)
    if highlighted_fields:
        visit_objects(value, _visit_print_selected)
    else:
        visit_objects(value, _visit_print_member)

# def _visit_set_highlight_member(value, path):
#     field = _get_field(value)
#     if field is not None:
#         highlighted_fields.append(field)
#         return True
#     return False

def set_highlight(debugger, command, result, internal_dict):
    """
    Command function to print public members of an object.
    """
    global highlighted_fields
    # Retrieve the target object
    thread = debugger.GetSelectedTarget().GetProcess().GetSelectedThread()
    frame = thread.GetSelectedFrame()
    
    # Evaluate the command to get the object
    value = frame.EvaluateExpression(command)
    highlighted_fields = _get_fields(value)
    # for other_frame in thread:
    #     if other_frame.GetFrameID() <= frame.GetFrameID():
    #         continue
    #     if "HandleSehExceptionsInMethodIfSupported" in frame.GetFunctionName():
    #         break
    #     addr = str(frame.GetPCAddress()).split(" at ")[-1]
    #     print(f"Frame #{other_frame.idx}: {simplify_name(other_frame.GetFunctionName())} at {addr}")
    #     for var in other_frame.get_all_variables():
    #         visit_objects(var, _visit_print_selected)

def bbstack(debugger, command, result, internal_dict):
    thread = debugger.GetSelectedTarget().GetProcess().GetSelectedThread()
    # Print the stack trace
    for frame in thread:
        if "HandleSehExceptionsInMethodIfSupported" in frame.GetFunctionName():
            break
        addr = str(frame.GetPCAddress()).split(" at ")[-1]
        print(f"Frame #{frame.idx}: {simplify_name(frame.GetFunctionName())} at {addr}")
def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand('command script add -f debug_helpers.print_members print_members')
    debugger.HandleCommand('command script add -f debug_helpers.set_highlight set_highlight')
    debugger.HandleCommand('command script add -f debug_helpers.bbstack bbstack')