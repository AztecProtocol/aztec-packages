
import lldb

def visit_objects(value, func, indent=0):
    """
    Traverses the object structure and applies the given function to each object.
    """
    if func(value, indent):
        return

    # Iterate over all child members of the object
    for i in range(value.GetNumChildren()):
        child = value.GetChildAtIndex(i)
        if child.IsValid():
            visit_objects(child, func, indent + 1)

    # Check for and print members of base classes
    stype = value.GetType()
    for i in range(stype.GetNumberOfDirectBaseClasses()):
        base_class = stype.GetDirectBaseClassAtIndex(i)
        base_class_value = value.Cast(base_class.GetType())
        visit_objects(base_class_value, func, indent + 2)

highlighted_fields = []

def _get_field(value):
    if type_name.startswith("barretenberg::field"):
        num = 0
        for i in range(4):
            num += int(value.GetChildMemberWithName("data").GetChildAtIndex(i).GetValue()) * 2**(64*i)
        return num
    return None

def _get_fields(value):
    fields = []
    def visit(subvalue):
        field = _get_field(subvalue)
        if field:
            fields.append(field)
    visit_objects(value, visit)
    return fields

def _visit_print_member(value, indent=0):
    """
    Function to print a single member's information.
    """
    type_name = value.GetType().GetName()
    print(" " * (indent-1) + f"{value.GetName()}:")

    if highlighted_fields and _get_fields(value) != highlighted_fields:
        return

    field = _get_field(value)
    if field:
        print(" " * indent + str(field))
        return True

    if value.GetValue() is not None:
        print(" " * indent + f"{value.GetValue()}")
        return True

    return False

def print_public_members(debugger, command, result, internal_dict):
    """
    Command function to print public members of an object.
    """
    # Retrieve the target object
    frame = debugger.GetSelectedTarget().GetProcess().GetSelectedThread().GetSelectedFrame()
    
    # Evaluate the command to get the object
    value = frame.EvaluateExpression(command)
    visit_objects(value, _visit_print_member)

def _visit_set_highlight_member(value, indent):
    type_name = value.GetType().GetName()

    if type_name.startswith("barretenberg::field"):
        num = 0
        for i in range(4):
            num += int(value.GetChildMemberWithName("data").GetChildAtIndex(i).GetValue()) * 2**(64*i)
        highlighted_fields.append(num)
    return False

def set_highlight(debugger, command, result, internal_dict):
    """
    Command function to print public members of an object.
    """
    global highlighted_fields
    highlighted_fields = []
    # Retrieve the target object
    frame = debugger.GetSelectedTarget().GetProcess().GetSelectedThread().GetSelectedFrame()
    
    # Evaluate the command to get the object
    value = frame.EvaluateExpression(command)
    visit_objects(value, _visit_set_highlight_member)

def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand('command script add -f debug_helpers.print_public_members print_public_members')
    debugger.HandleCommand('command script add -f debug_helpers.set_highlight set_highlight')