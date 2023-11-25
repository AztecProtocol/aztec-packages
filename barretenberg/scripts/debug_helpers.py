
import lldb

def simplify_name(name):
    return name \
        .replace("barretenberg::field<barretenberg::Bn254FqParams>", "fq") \
        .replace("barretenberg::field<barretenberg::Bn254FrParams>", "fr") \
        .replace("barretenberg::group_elements::affine_element<fq, fr, barretenberg::Bn254G1Params>", "g1_affine_element")

def visit_objects(value, func, path=[]):
    """
    Traverses the object structure and applies the given function to each object.
    """
    if func(value, path):
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
            for part in path[:-1]:
                print(simplify_name(part))
            visit_objects(value, _visit_print_member)
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
    frame = debugger.GetSelectedTarget().GetProcess().GetSelectedThread().GetSelectedFrame()
    
    # Evaluate the command to get the object
    value = frame.EvaluateExpression(command)
    highlighted_fields = _get_fields(value)

def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand('command script add -f debug_helpers.print_members print_members')
    debugger.HandleCommand('command script add -f debug_helpers.set_highlight set_highlight')