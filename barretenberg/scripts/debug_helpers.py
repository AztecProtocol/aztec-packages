
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

def _visit_print_member(value, indent=0):
    """
    Function to print a single member's information.
    """
    type_name = value.GetType().GetName()

    if type_name.startswith("barretenberg::field"):
        num = 0
        for i in range(4):
            num += int(value.GetChildMemberWithName("data").GetChildAtIndex(i).GetValue()) * 2**(64*i)
        if num in highlighted_fields:
            print(">>" * indent + str(num))
        else:
            print(" " * indent + str(num))
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

def _visit_set_highlight_member(value):
    type_name = value.GetType().GetName()

    if type_name.startswith("barretenberg::field"):
        num = 0
        for i in range(4):
            num += int(value.GetChildMemberWithName("data").GetChildAtIndex(i).GetValue()) * 2**(64*i)
        highlighted_fields.append(num)
    return True

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
# def set_highlight_fields(value):
#     global highlighted_field
#     if value.GetType().GetName().startswith("barretenberg::field"):
#         num = 0
#         for i in range(4):
#             num += int(value.GetChildMemberWithName("data").GetChildAtIndex(i).GetValue()) * 2**(64*i)
#         highlighted_field.append(num)
#         return
#     # Iterate over all child members of the object
#     for i in range(value.GetNumChildren()):
#         child = value.GetChildAtIndex(i)
#         if child.IsValid():
#             set_highlight_fields(child, indent + 1)

#     # Check for and print members of base classes
#     stype = value.GetType()
#     for i in range(stype.GetNumberOfDirectBaseClasses()):
#         base_class = stype.GetDirectBaseClassAtIndex(i)
#         base_class_value = value.Cast(base_class.GetType())
#         print_members(base_class_value, indent + 2)

# def print_members(value, indent=0):
#     global highlighted_field
#     if value.GetType().GetName().startswith("barretenberg::field"):
#         num = 0
#         for i in range(4):
#             num += int(value.GetChildMemberWithName("data").GetChildAtIndex(i).GetValue()) * 2**(64*i)
#         if highlighted_field = num:
#             print(" " * indent + str(num))
#         else:
#             print(" " * indent + str(num))
#         return
#     if value.GetValue() is not None: # and value.IsPublic():
#         print(" " * indent + f"{value.GetValue()}")
#         return
#     # Iterate over all child members of the object
#     for i in range(value.GetNumChildren()):
#         child = value.GetChildAtIndex(i)
#         if child.IsValid():
#             print(" " * indent + f"{child.GetName()}:")
#             print_members(child, indent + 1)

#     # Check for and print members of base classes
#     stype = value.GetType()
#     for i in range(stype.GetNumberOfDirectBaseClasses()):
#         base_class = stype.GetDirectBaseClassAtIndex(i)
#         base_class_value = value.Cast(base_class.GetType())
#         print_members(base_class_value, indent + 2)

def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand('command script add -f debug_helpers.print_public_members print_public_members')