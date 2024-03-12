mod transforms;
mod utils;

use convert_case::{Case, Casing};
use iter_extended::vecmap;
use noirc_errors::{Location, Spanned};
use noirc_frontend::hir::def_collector::dc_crate::{UnresolvedFunctions, UnresolvedTraitImpl};
use noirc_frontend::hir::def_map::{LocalModuleId, ModuleId};
use noirc_frontend::macros_api::parse_program;
use noirc_frontend::macros_api::FieldElement;
use noirc_frontend::macros_api::{
    BlockExpression, CallExpression, CastExpression, Distinctness, Expression, ExpressionKind,
    ForLoopStatement, ForRange, FunctionDefinition, FunctionReturnType, HirContext, HirExpression,
    HirLiteral, HirStatement, Ident, IndexExpression, LetStatement, Literal,
    MemberAccessExpression, MethodCallExpression, NoirFunction, NoirStruct, Param, Path, PathKind,
    Pattern, PrefixExpression, SecondaryAttribute, Signedness, Span, Statement, StatementKind,
    StructType, Type, TypeImpl, UnaryOp, UnresolvedType, UnresolvedTypeData, Visibility,
};
use noirc_frontend::macros_api::{CrateId, FileId};
use noirc_frontend::macros_api::{MacroError, MacroProcessor};
use noirc_frontend::macros_api::{ModuleDefId, NodeInterner, SortedModule, StructId};
use noirc_frontend::node_interner::{FuncId, TraitId, TraitImplId, TraitImplKind};
use noirc_frontend::{
    BinaryOpKind, ConstrainKind, ConstrainStatement, InfixExpression, ItemVisibility, Lambda,
};
pub struct AztecMacro;

impl MacroProcessor for AztecMacro {
    fn process_untyped_ast(
        &self,
        ast: SortedModule,
        crate_id: &CrateId,
        context: &HirContext,
    ) -> Result<SortedModule, (MacroError, FileId)> {
        transform(ast, crate_id, context)
    }

    fn process_collected_defs(
        &self,
        crate_id: &CrateId,
        context: &mut HirContext,
        collected_trait_impls: &[UnresolvedTraitImpl],
        collected_functions: &mut [UnresolvedFunctions],
    ) -> Result<(), (MacroError, FileId)> {
        transform_collected_defs(crate_id, context, collected_trait_impls, collected_functions)
    }

    fn process_typed_ast(
        &self,
        crate_id: &CrateId,
        context: &mut HirContext,
    ) -> Result<(), (MacroError, FileId)> {
        transform_hir(crate_id, context).map_err(|(err, file_id)| (err.into(), file_id))
    }
}

//
//                    Create AST Nodes for Aztec
//

/// Traverses every function in the ast, calling `transform_function` which
/// determines if further processing is required
fn transform(
    mut ast: SortedModule,
    crate_id: &CrateId,
    context: &HirContext,
) -> Result<SortedModule, (MacroError, FileId)> {
    // Usage -> mut ast -> aztec_library::transform(&mut ast)
    // Covers all functions in the ast
    for submodule in ast.submodules.iter_mut().filter(|submodule| submodule.is_contract) {
        if transform_module(&mut submodule.contents, crate_id, context)
            .map_err(|(err, file_id)| (err.into(), file_id))?
        {
            check_for_aztec_dependency(crate_id, context)?;
        }
    }
    Ok(ast)
}

/// Determines if ast nodes are annotated with aztec attributes.
/// For annotated functions it calls the `transform` function which will perform the required transformations.
/// Returns true if an annotated node is found, false otherwise
fn transform_module(
    module: &mut SortedModule,
    crate_id: &CrateId,
    context: &HirContext,
) -> Result<bool, (AztecMacroError, FileId)> {
    let mut has_transformed_module = false;

    // Check for a user defined storage struct
    let storage_defined = check_for_storage_definition(module);
    let storage_implemented = check_for_storage_implementation(module);

    let crate_graph = &context.crate_graph[crate_id];

    if storage_defined && !storage_implemented {
        generate_storage_implementation(module).map_err(|err| (err, crate_graph.root_file_id))?;
    }

    for structure in module.types.iter() {
        if structure.attributes.iter().any(|attr| matches!(attr, SecondaryAttribute::Event)) {
            module.impls.push(generate_selector_impl(structure));
            has_transformed_module = true;
        }
    }

    let has_initializer = module.functions.iter().any(|func| {
        func.def
            .attributes
            .secondary
            .iter()
            .any(|attr| is_custom_attribute(attr, "aztec(initializer)"))
    });

    for func in module.functions.iter_mut() {
        let mut is_private = false;
        let mut is_public = false;
        let mut is_public_vm = false;
        let mut is_initializer = false;
        let mut is_internal = false;
        let mut insert_init_check = has_initializer;

        for secondary_attribute in func.def.attributes.secondary.clone() {
            if is_custom_attribute(&secondary_attribute, "aztec(private)") {
                is_private = true;
            } else if is_custom_attribute(&secondary_attribute, "aztec(initializer)") {
                is_initializer = true;
                insert_init_check = false;
            } else if is_custom_attribute(&secondary_attribute, "aztec(noinitcheck)") {
                insert_init_check = false;
            } else if is_custom_attribute(&secondary_attribute, "aztec(internal)") {
                is_internal = true;
            } else if is_custom_attribute(&secondary_attribute, "aztec(public)") {
                is_public = true;
            } else if is_custom_attribute(&secondary_attribute, "aztec(public-vm)") {
                is_public_vm = true;
            }
        }

        // Apply transformations to the function based on collected attributes
        if is_private || is_public {
            transform_function(
                if is_private { "Private" } else { "Public" },
                func,
                storage_defined,
                is_initializer,
                insert_init_check,
                is_internal,
            )
            .map_err(|err| (err, crate_graph.root_file_id))?;
            has_transformed_module = true;
        } else if is_public_vm {
            transform_vm_function(func, storage_defined)
                .map_err(|err| (err, crate_graph.root_file_id))?;
            has_transformed_module = true;
        } else if storage_defined && func.def.is_unconstrained {
            transform_unconstrained(func);
            has_transformed_module = true;
        }
    }

    if has_transformed_module {
        // We only want to run these checks if the macro processor has found the module to be an Aztec contract.

        let private_functions_count = module
            .functions
            .iter()
            .filter(|func| {
                func.def
                    .attributes
                    .secondary
                    .iter()
                    .any(|attr| is_custom_attribute(attr, "aztec(private)"))
            })
            .count();

        if private_functions_count > MAX_CONTRACT_PRIVATE_FUNCTIONS {
            let crate_graph = &context.crate_graph[crate_id];
            return Err((
                AztecMacroError::ContractHasTooManyPrivateFunctions { span: Span::default() },
                crate_graph.root_file_id,
            ));
        }

        let constructor_defined = module.functions.iter().any(|func| func.name() == "constructor");
        if !constructor_defined {
            let crate_graph = &context.crate_graph[crate_id];
            return Err((
                AztecMacroError::ContractConstructorMissing { span: Span::default() },
                crate_graph.root_file_id,
            ));
        }
    }

    Ok(has_transformed_module)
}

fn transform_collected_defs(
    crate_id: &CrateId,
    context: &mut HirContext,
) -> Result<(), (AztecMacroError, FileId)> {
    for struct_id in collect_crate_structs(crate_id, context) {
        let attributes = context.def_interner.struct_attributes(&struct_id);
        if attributes.iter().any(|attr| matches!(attr, SecondaryAttribute::Event)) {
            transform_event(struct_id, &mut context.def_interner)?;
        }
    }
    Ok(())
}

/// Obtains the serialized length of a type that implements the Serialize trait.
fn get_serialized_length(
    traits: &[TraitId],
    typ: &Type,
    interner: &NodeInterner,
) -> Result<u64, AztecMacroError> {
    let (struct_name, maybe_stored_in_state) = match typ {
        Type::Struct(struct_type, generics) => {
            Ok((struct_type.borrow().name.0.contents.clone(), generics.first()))
        }
        _ => Err(AztecMacroError::CouldNotAssignStorageSlots {
            secondary_message: Some("State storage variable must be a struct".to_string()),
        }),
    }?;
    let stored_in_state =
        maybe_stored_in_state.ok_or(AztecMacroError::CouldNotAssignStorageSlots {
            secondary_message: Some("State storage variable must be generic".to_string()),
        })?;

    let is_note = traits.iter().any(|&trait_id| {
        let r#trait = interner.get_trait(trait_id);
        r#trait.name.0.contents == "NoteInterface"
            && !interner.lookup_all_trait_implementations(stored_in_state, trait_id).is_empty()
    });

    // Maps and (private) Notes always occupy a single slot. Someone could store a Note in PublicMutable for whatever reason though.
    if struct_name == "Map" || (is_note && struct_name != "PublicMutable") {
        return Ok(1);
    }

    let serialized_trait_impl_kind = traits
        .iter()
        .find_map(|&trait_id| {
            let r#trait = interner.get_trait(trait_id);
            if r#trait.borrow().name.0.contents == "Serialize"
                && r#trait.borrow().generics.len() == 1
            {
                interner
                    .lookup_all_trait_implementations(stored_in_state, trait_id)
                    .into_iter()
                    .next()
            } else {
                None
            }
        })
        .ok_or(AztecMacroError::CouldNotAssignStorageSlots {
            secondary_message: Some("Stored data must implement Serialize trait".to_string()),
        })?;

    let serialized_trait_impl_id = match serialized_trait_impl_kind {
        TraitImplKind::Normal(trait_impl_id) => Ok(trait_impl_id),
        _ => Err(AztecMacroError::CouldNotAssignStorageSlots { secondary_message: None }),
    }?;

    let serialized_trait_impl_shared = interner.get_trait_implementation(*serialized_trait_impl_id);
    let serialized_trait_impl = serialized_trait_impl_shared.borrow();

    match serialized_trait_impl.trait_generics.first().unwrap() {
        Type::Constant(value) => Ok(*value),
        _ => Err(AztecMacroError::CouldNotAssignStorageSlots { secondary_message: None }),
    }
}

/// Assigns storage slots to the storage struct fields based on the serialized length of the types. This automatic assignment
/// will only trigger if the assigned storage slot is invalid (0 as generated by generate_storage_implementation)
fn assign_storage_slots(
    crate_id: &CrateId,
    context: &mut HirContext,
) -> Result<(), (AztecMacroError, FileId)> {
    let traits: Vec<_> = collect_traits(context);
    for struct_id in collect_crate_structs(crate_id, context) {
        let interner: &mut NodeInterner = context.def_interner.borrow_mut();
        let r#struct = interner.get_struct(struct_id);
        let file_id = r#struct.borrow().location.file;
        if r#struct.borrow().name.0.contents == "Storage" && r#struct.borrow().id.krate().is_root()
        {
            let init_id = interner
                .lookup_method(
                    &Type::Struct(interner.get_struct(struct_id), vec![]),
                    struct_id,
                    "init",
                    false,
                )
                .ok_or((
                    AztecMacroError::CouldNotAssignStorageSlots {
                        secondary_message: Some(
                            "Storage struct must have an init function".to_string(),
                        ),
                    },
                    file_id,
                ))?;
            let init_function = interner.function(&init_id).block(interner);
            let init_function_statement_id = init_function.statements().first().ok_or((
                AztecMacroError::CouldNotAssignStorageSlots {
                    secondary_message: Some("Init storage statement not found".to_string()),
                },
                file_id,
            ))?;
            let storage_constructor_statement = interner.statement(init_function_statement_id);

            let storage_constructor_expression = match storage_constructor_statement {
                HirStatement::Expression(expression_id) => {
                    match interner.expression(&expression_id) {
                        HirExpression::Constructor(hir_constructor_expression) => {
                            Ok(hir_constructor_expression)
                        }
                        _ => Err((AztecMacroError::CouldNotAssignStorageSlots {
                            secondary_message: Some(
                                "Storage constructor statement must be a constructor expression"
                                    .to_string(),
                            ),
                        }, file_id))
                    }
                }
                _ => Err((
                    AztecMacroError::CouldNotAssignStorageSlots {
                        secondary_message: Some(
                            "Storage constructor statement must be an expression".to_string(),
                        ),
                    },
                    file_id,
                )),
            }?;

            let mut storage_slot: u64 = 1;
            for (index, (_, expr_id)) in storage_constructor_expression.fields.iter().enumerate() {
                let fields = r#struct.borrow().get_fields(&[]);
                let (_, field_type) = fields.get(index).unwrap();
                let new_call_expression = match interner.expression(expr_id) {
                    HirExpression::Call(hir_call_expression) => Ok(hir_call_expression),
                    _ => Err((
                        AztecMacroError::CouldNotAssignStorageSlots {
                            secondary_message: Some(
                                "Storage field initialization expression is not a call expression"
                                    .to_string(),
                            ),
                        },
                        file_id,
                    )),
                }?;

                let slot_arg_expression = interner.expression(&new_call_expression.arguments[1]);

                let current_storage_slot = match slot_arg_expression {
                    HirExpression::Literal(HirLiteral::Integer(slot, _)) => Ok(slot.to_u128()),
                    _ => Err((
                        AztecMacroError::CouldNotAssignStorageSlots {
                            secondary_message: Some(
                                "Storage slot argument expression must be a literal integer"
                                    .to_string(),
                            ),
                        },
                        file_id,
                    )),
                }?;

                if current_storage_slot != 0 {
                    continue;
                }

                let type_serialized_len = get_serialized_length(&traits, field_type, interner)
                    .map_err(|err| (err, file_id))?;
                interner.update_expression(new_call_expression.arguments[1], |expr| {
                    *expr = HirExpression::Literal(HirLiteral::Integer(
                        FieldElement::from(u128::from(storage_slot)),
                        false,
                    ));
                });

                storage_slot += type_serialized_len;
            }
        }
    }
    Ok(())
}

const SIGNATURE_PLACEHOLDER: &str = "SIGNATURE_PLACEHOLDER";

/// Generates the impl for an event selector
///
/// Inserts the following code:
/// ```noir
/// impl SomeStruct {
///    fn selector() -> FunctionSelector {
///       aztec::protocol_types::abis::function_selector::FunctionSelector::from_signature("SIGNATURE_PLACEHOLDER")
///    }
/// }
/// ```
///
/// This allows developers to emit events without having to write the signature of the event every time they emit it.
/// The signature cannot be known at this point since types are not resolved yet, so we use a signature placeholder.
/// It'll get resolved after by transforming the HIR.
fn generate_selector_impl(structure: &NoirStruct) -> TypeImpl {
    let struct_type =
        make_type(UnresolvedTypeData::Named(path(structure.name.clone()), vec![], true));

    let selector_path =
        chained_dep!("aztec", "protocol_types", "abis", "function_selector", "FunctionSelector");
    let mut from_signature_path = selector_path.clone();
    from_signature_path.segments.push(ident("from_signature"));

    let selector_fun_body = BlockExpression(vec![make_statement(StatementKind::Expression(call(
        variable_path(from_signature_path),
        vec![expression(ExpressionKind::Literal(Literal::Str(SIGNATURE_PLACEHOLDER.to_string())))],
    )))]);

    // Define `FunctionSelector` return type
    let return_type =
        FunctionReturnType::Ty(make_type(UnresolvedTypeData::Named(selector_path, vec![], true)));

    let mut selector_fn_def = FunctionDefinition::normal(
        &ident("selector"),
        &vec![],
        &[],
        &selector_fun_body,
        &[],
        &return_type,
    );

    selector_fn_def.visibility = ItemVisibility::Public;

    // Seems to be necessary on contract modules
    selector_fn_def.return_visibility = Visibility::Public;

    TypeImpl {
        object_type: struct_type,
        type_span: structure.span,
        generics: vec![],
        methods: vec![(NoirFunction::normal(selector_fn_def), Span::default())],
    }
}

/// Helper function that returns what the private context would look like in the ast
/// This should make it available to be consumed within aztec private annotated functions.
///
/// The replaced code:
/// ```noir
/// /// Before
/// fn foo(inputs: PrivateContextInputs) {
///    // ...
/// }
///
/// /// After
/// #[aztec(private)]
/// fn foo() {
///   // ...
/// }
fn create_inputs(ty: &str) -> Param {
    let context_ident = ident("inputs");
    let context_pattern = Pattern::Identifier(context_ident);

    let path_snippet = ty.to_case(Case::Snake); // e.g. private_context_inputs
    let type_path = chained_dep!("aztec", "context", "inputs", &path_snippet, ty);

    let context_type = make_type(UnresolvedTypeData::Named(type_path, vec![], true));
    let visibility = Visibility::Private;

    Param { pattern: context_pattern, typ: context_type, visibility, span: Span::default() }
}

/// Creates an initialization check to ensure that the contract has been initialized, meant to
/// be injected as the first statement of any function after the context has been created.
///
/// ```noir
/// assert_is_initialized(&mut context);
/// ```
fn create_init_check() -> Statement {
    make_statement(StatementKind::Expression(call(
        variable_path(chained_dep!("aztec", "initializer", "assert_is_initialized")),
        vec![mutable_reference("context")],
    )))
}

/// Creates a call to mark_as_initialized which emits the initialization nullifier, meant to
/// be injected as the last statement before returning in a constructor.
///
/// ```noir
/// mark_as_initialized(&mut context);
/// ```
fn create_mark_as_initialized(ty: &str) -> Statement {
    let name = if ty == "Public" { "mark_as_initialized_public" } else { "mark_as_initialized" };
    make_statement(StatementKind::Expression(call(
        variable_path(chained_dep!("aztec", "initializer", name)),
        vec![mutable_reference("context")],
    )))
}

/// Creates a check for internal functions ensuring that the caller is self.
///
/// ```noir
/// assert(context.msg_sender() == context.this_address(), "Function can only be called internally");
/// ```
fn create_internal_check(fname: &str) -> Statement {
    make_statement(StatementKind::Constrain(ConstrainStatement(
        make_eq(
            method_call(variable("context"), "msg_sender", vec![]),
            method_call(variable("context"), "this_address", vec![]),
        ),
        Some(expression(ExpressionKind::Literal(Literal::Str(format!(
            "Function {} can only be called internally",
            fname
        ))))),
        ConstrainKind::Assert,
    )))
}

/// Creates the private context object to be accessed within the function, the parameters need to be extracted to be
/// appended into the args hash object.
///
/// The replaced code:
/// ```noir
/// #[aztec(private)]
/// fn foo(structInput: SomeStruct, arrayInput: [u8; 10], fieldInput: Field) -> Field {
///     // Create the hasher object
///     let mut hasher = Hasher::new();
///
///     // struct inputs call serialize on them to add an array of fields
///     hasher.add_multiple(structInput.serialize());
///
///     // Array inputs are iterated over and each element is added to the hasher (as a field)
///     for i in 0..arrayInput.len() {
///         hasher.add(arrayInput[i] as Field);
///     }
///     // Field inputs are added to the hasher
///     hasher.add({ident});
///
///     // Create the context
///     // The inputs (injected by this `create_inputs`) and completed hash object are passed to the context
///     let mut context = PrivateContext::new(inputs, hasher.hash());
/// }
/// ```
fn create_context(ty: &str, params: &[Param]) -> Result<Vec<Statement>, AztecMacroError> {
    let mut injected_expressions: Vec<Statement> = vec![];

    // `let mut hasher = Hasher::new();`
    let let_hasher = mutable_assignment(
        "hasher", // Assigned to
        call(
            variable_path(chained_dep!("aztec", "hasher", "Hasher", "new")), // Path
            vec![],                                                          // args
        ),
    );

    // Completes: `let mut hasher = Hasher::new();`
    injected_expressions.push(let_hasher);

    // Iterate over each of the function parameters, adding to them to the hasher
    for Param { pattern, typ, span, .. } in params {
        match pattern {
            Pattern::Identifier(identifier) => {
                // Match the type to determine the padding to do
                let unresolved_type = &typ.typ;
                let expression = match unresolved_type {
                    // `hasher.add_multiple({ident}.serialize())`
                    UnresolvedTypeData::Named(..) => add_struct_to_hasher(identifier),
                    UnresolvedTypeData::Array(_, arr_type) => {
                        add_array_to_hasher(identifier, arr_type)
                    }
                    // `hasher.add({ident})`
                    UnresolvedTypeData::FieldElement => add_field_to_hasher(identifier),
                    // Add the integer to the hasher, casted to a field
                    // `hasher.add({ident} as Field)`
                    UnresolvedTypeData::Integer(..) | UnresolvedTypeData::Bool => {
                        add_cast_to_hasher(identifier)
                    }
                    UnresolvedTypeData::String(..) => {
                        let (var_bytes, id) = str_to_bytes(identifier);
                        injected_expressions.push(var_bytes);
                        add_array_to_hasher(
                            &id,
                            &UnresolvedType {
                                typ: UnresolvedTypeData::Integer(
                                    Signedness::Unsigned,
                                    noirc_frontend::IntegerBitSize::ThirtyTwo,
                                ),
                                span: None,
                            },
                        )
                    }
                    _ => {
                        return Err(AztecMacroError::UnsupportedFunctionArgumentType {
                            typ: unresolved_type.clone(),
                            span: *span,
                        })
                    }
                };
                injected_expressions.push(expression);
            }
            _ => todo!(), // Maybe unreachable?
        }
    }

    // Create the inputs to the context
    let inputs_expression = variable("inputs");
    // `hasher.hash()`
    let hash_call = method_call(
        variable("hasher"), // variable
        "hash",             // method name
        vec![],             // args
    );

    let path_snippet = ty.to_case(Case::Snake); // e.g. private_context

    // let mut context = {ty}::new(inputs, hash);
    let let_context = mutable_assignment(
        "context", // Assigned to
        call(
            variable_path(chained_dep!("aztec", "context", &path_snippet, ty, "new")), // Path
            vec![inputs_expression, hash_call],                                        // args
        ),
    );
    injected_expressions.push(let_context);

    // Return all expressions that will be injected by the hasher
    Ok(injected_expressions)
}

/// Creates an mutable avm context
///
/// ```noir
/// /// Before
/// #[aztec(public-vm)]
/// fn foo() -> Field {
///   let mut context = aztec::context::AVMContext::new();
///   let timestamp = context.timestamp();
///   // ...
/// }
///
/// /// After
/// #[aztec(private)]
/// fn foo() -> Field {
///     let mut timestamp = context.timestamp();
///     // ...
/// }
fn create_avm_context() -> Result<Statement, AztecMacroError> {
    let let_context = mutable_assignment(
        "context", // Assigned to
        call(
            variable_path(chained_dep!("aztec", "context", "AVMContext", "new")), // Path
            vec![],                                                               // args
        ),
    );

    Ok(let_context)
}

/// Abstract Return Type
///
/// This function intercepts the function's current return type and replaces it with pushes
/// To the kernel
///
/// The replaced code:
/// ```noir
/// /// Before
/// #[aztec(private)]
/// fn foo() -> protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
///   // ...
///   let my_return_value: Field = 10;
///   context.return_values.push(my_return_value);
/// }
///
/// /// After
/// #[aztec(private)]
/// fn foo() -> Field {
///     // ...
///    let my_return_value: Field = 10;
///    my_return_value
/// }
/// ```
/// Similarly; Structs will be pushed to the context, after serialize() is called on them.
/// Arrays will be iterated over and each element will be pushed to the context.
/// Any primitive type that can be cast will be casted to a field and pushed to the context.
fn abstract_return_values(func: &NoirFunction) -> Option<Statement> {
    let current_return_type = func.return_type().typ;
    let last_statement = func.def.body.0.last()?;

    // TODO: (length, type) => We can limit the size of the array returned to be limited by kernel size
    // Doesn't need done until we have settled on a kernel size
    // TODO: support tuples here and in inputs -> convert into an issue
    // Check if the return type is an expression, if it is, we can handle it
    match last_statement {
        Statement { kind: StatementKind::Expression(expression), .. } => {
            match current_return_type {
                // Call serialize on structs, push the whole array, calling push_array
                UnresolvedTypeData::Named(..) => Some(make_struct_return_type(expression.clone())),
                UnresolvedTypeData::Array(..) => Some(make_array_return_type(expression.clone())),
                // Cast these types to a field before pushing
                UnresolvedTypeData::Bool | UnresolvedTypeData::Integer(..) => {
                    Some(make_castable_return_type(expression.clone()))
                }
                UnresolvedTypeData::FieldElement => Some(make_return_push(expression.clone())),
                _ => None,
            }
        }
        _ => None,
    }
}

/// Abstract storage
///
/// For private functions:
/// ```noir
/// #[aztec(private)]
/// fn lol() {
///     let storage = Storage::init(Context::private(context));
/// }
/// ```
///
/// For public functions:
/// ```noir
/// #[aztec(public)]
/// fn lol() {
///    let storage = Storage::init(Context::public(context));
/// }
/// ```
///
/// For unconstrained functions:
/// ```noir
/// unconstrained fn lol() {
///   let storage = Storage::init(Context::none());
/// }
fn abstract_storage(typ: &str, unconstrained: bool) -> Statement {
    let init_context_call = if unconstrained {
        call(
            variable_path(chained_dep!("aztec", "context", "Context", "none")), // Path
            vec![],                                                             // args
        )
    } else {
        call(
            variable_path(chained_dep!("aztec", "context", "Context", typ)), // Path
            vec![mutable_reference("context")],                              // args
        )
    };

    assignment(
        "storage", // Assigned to
        call(
            variable_path(chained_path!("Storage", "init")), // Path
            vec![init_context_call],                         // args
        ),
    )
}

/// Context Return Values
///
/// Creates an instance to the context return values
/// ```noir
/// `context.return_values`
/// ```
fn context_return_values() -> Expression {
    member_access("context", "return_values")
}

fn make_statement(kind: StatementKind) -> Statement {
    Statement { span: Span::default(), kind }
}

/// Make return Push
///
/// Translates to:
/// `context.return_values.push({push_value})`
fn make_return_push(push_value: Expression) -> Statement {
    make_statement(StatementKind::Semi(method_call(
        context_return_values(),
        "push",
        vec![push_value],
    )))
}

/// Make Return push array
///
/// Translates to:
/// `context.return_values.extend_from_array({push_value})`
fn make_return_extend_from_array(push_value: Expression) -> Statement {
    make_statement(StatementKind::Semi(method_call(
        context_return_values(),
        "extend_from_array",
        vec![push_value],
    )))
}

/// Make struct return type
///
/// Translates to:
/// ```noir
/// `context.return_values.extend_from_array({push_value}.serialize())`
fn make_struct_return_type(expression: Expression) -> Statement {
    let serialized_call = method_call(
        expression,  // variable
        "serialize", // method name
        vec![],      // args
    );
    make_return_extend_from_array(serialized_call)
}

/// Make array return type
///
/// Translates to:
/// ```noir
/// for i in 0..{ident}.len() {
///    context.return_values.push({ident}[i] as Field)
/// }
/// ```
fn make_array_return_type(expression: Expression) -> Statement {
    let inner_cast_expression =
        cast(index_array_variable(expression.clone(), "i"), UnresolvedTypeData::FieldElement);
    let assignment = make_statement(StatementKind::Semi(method_call(
        context_return_values(), // variable
        "push",                  // method name
        vec![inner_cast_expression],
    )));

    create_loop_over(expression, vec![assignment])
}

/// Castable return type
///
/// Translates to:
/// ```noir
/// context.return_values.push({ident} as Field)
/// ```
fn make_castable_return_type(expression: Expression) -> Statement {
    // Cast these types to a field before pushing
    let cast_expression = cast(expression, UnresolvedTypeData::FieldElement);
    make_return_push(cast_expression)
}

/// Create Return Type
///
/// Public functions return protocol_types::abis::public_circuit_public_inputs::PublicCircuitPublicInputs while
/// private functions return protocol_types::abis::private_circuit_public_inputs::::PrivateCircuitPublicInputs
///
/// This call constructs an ast token referencing the above types
/// The name is set in the function above `transform`, hence the
/// whole token name is passed in
///
/// The replaced code:
/// ```noir
///
/// /// Before
/// fn foo() -> protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
///    // ...
/// }
///
/// /// After
/// #[aztec(private)]
/// fn foo() {
///  // ...
/// }
fn create_return_type(ty: &str) -> FunctionReturnType {
    let path_snippet = ty.to_case(Case::Snake); // e.g. private_circuit_public_inputs or public_circuit_public_inputs
    let return_path = chained_dep!("aztec", "protocol_types", "abis", &path_snippet, ty);
    return_type(return_path)
}

/// Create Context Finish
///
/// Each aztec function calls `context.finish()` at the end of a function
/// to return values required by the kernel.
///
/// The replaced code:
/// ```noir
/// /// Before
/// fn foo() -> protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs {
///   // ...
///  context.finish()
/// }
///
/// /// After
/// #[aztec(private)]
/// fn foo() {
///  // ...
/// }
fn create_context_finish() -> Statement {
    let method_call = method_call(
        variable("context"), // variable
        "finish",            // method name
        vec![],              // args
    );
    make_statement(StatementKind::Expression(method_call))
}

//
//                 Methods to create hasher inputs
//

fn add_struct_to_hasher(identifier: &Ident) -> Statement {
    // If this is a struct, we call serialize and add the array to the hasher
    let serialized_call = method_call(
        variable_path(path(identifier.clone())), // variable
        "serialize",                             // method name
        vec![],                                  // args
    );

    make_statement(StatementKind::Semi(method_call(
        variable("hasher"),    // variable
        "add_multiple",        // method name
        vec![serialized_call], // args
    )))
}

fn str_to_bytes(identifier: &Ident) -> (Statement, Ident) {
    // let identifier_as_bytes = identifier.as_bytes();
    let var = variable_ident(identifier.clone());
    let contents = if let ExpressionKind::Variable(p) = &var.kind {
        p.segments.first().cloned().unwrap_or_else(|| panic!("No segments")).0.contents
    } else {
        panic!("Unexpected identifier type")
    };
    let bytes_name = format!("{}_bytes", contents);
    let var_bytes = assignment(&bytes_name, method_call(var, "as_bytes", vec![]));
    let id = Ident::new(bytes_name, Span::default());

    (var_bytes, id)
}

fn create_loop_over(var: Expression, loop_body: Vec<Statement>) -> Statement {
    // If this is an array of primitive types (integers / fields) we can add them each to the hasher
    // casted to a field
    let span = var.span;

    // `array.len()`
    let end_range_expression = method_call(
        var,    // variable
        "len",  // method name
        vec![], // args
    );

    // What will be looped over
    // - `hasher.add({ident}[i] as Field)`
    let for_loop_block = expression(ExpressionKind::Block(BlockExpression(loop_body)));

    // `for i in 0..{ident}.len()`
    make_statement(StatementKind::For(ForLoopStatement {
        range: ForRange::Range(
            expression(ExpressionKind::Literal(Literal::Integer(
                FieldElement::from(i128::from(0)),
                false,
            ))),
            end_range_expression,
        ),
        identifier: ident("i"),
        block: for_loop_block,
        span,
    }))
}

fn add_array_to_hasher(identifier: &Ident, arr_type: &UnresolvedType) -> Statement {
    // If this is an array of primitive types (integers / fields) we can add them each to the hasher
    // casted to a field

    // Wrap in the semi thing - does that mean ended with semi colon?
    // `hasher.add({ident}[i] as Field)`

    let arr_index = index_array(identifier.clone(), "i");
    let (add_expression, hasher_method_name) = match arr_type.typ {
        UnresolvedTypeData::Named(..) => {
            let hasher_method_name = "add_multiple".to_owned();
            let call = method_call(
                // All serialize on each element
                arr_index,   // variable
                "serialize", // method name
                vec![],      // args
            );
            (call, hasher_method_name)
        }
        _ => {
            let hasher_method_name = "add".to_owned();
            let call = cast(
                arr_index,                        // lhs - `ident[i]`
                UnresolvedTypeData::FieldElement, // cast to - `as Field`
            );
            (call, hasher_method_name)
        }
    };

    let block_statement = make_statement(StatementKind::Semi(method_call(
        variable("hasher"),  // variable
        &hasher_method_name, // method name
        vec![add_expression],
    )));

    create_loop_over(variable_ident(identifier.clone()), vec![block_statement])
}

fn add_field_to_hasher(identifier: &Ident) -> Statement {
    // `hasher.add({ident})`
    let ident = variable_path(path(identifier.clone()));
    make_statement(StatementKind::Semi(method_call(
        variable("hasher"), // variable
        "add",              // method name
        vec![ident],        // args
    )))
}

fn add_cast_to_hasher(identifier: &Ident) -> Statement {
    // `hasher.add({ident} as Field)`
    // `{ident} as Field`
    let cast_operation = cast(
        variable_path(path(identifier.clone())), // lhs
        UnresolvedTypeData::FieldElement,        // rhs
    );

    // `hasher.add({ident} as Field)`
    make_statement(StatementKind::Semi(method_call(
        variable("hasher"),   // variable
        "add",                // method name
        vec![cast_operation], // args
    )))
}

/// Computes the aztec signature for a resolved type.
fn signature_of_type(typ: &Type) -> String {
    match typ {
        Type::Integer(Signedness::Signed, bit_size) => format!("i{}", bit_size),
        Type::Integer(Signedness::Unsigned, bit_size) => format!("u{}", bit_size),
        Type::FieldElement => "Field".to_owned(),
        Type::Bool => "bool".to_owned(),
        Type::Array(len, typ) => {
            if let Type::Constant(len) = **len {
                format!("[{};{len}]", signature_of_type(typ))
            } else {
                unimplemented!("Cannot generate signature for array with length type {:?}", typ)
            }
        }
        Type::Struct(def, args) => {
            let fields = def.borrow().get_fields(args);
            let fields = vecmap(fields, |(_, typ)| signature_of_type(&typ));
            format!("({})", fields.join(","))
        }
        Type::Tuple(types) => {
            let fields = vecmap(types, signature_of_type);
            format!("({})", fields.join(","))
        }
        _ => unimplemented!("Cannot generate signature for type {:?}", typ),
    }
}

/// Computes the signature for a resolved event type.
/// It has the form 'EventName(Field,(Field),[u8;2])'
fn event_signature(event: &StructType) -> String {
    let fields = vecmap(event.get_fields(&[]), |(_, typ)| signature_of_type(&typ));
    format!("{}({})", event.name.0.contents, fields.join(","))
}

fn inject_compute_note_hash_and_nullifier(
    crate_id: &CrateId,
    context: &mut HirContext,
    unresolved_traits_impls: &[UnresolvedTraitImpl],
    collected_functions: &mut [UnresolvedFunctions],
) -> Result<(), (MacroError, FileId)> {
    if has_aztec_dependency(crate_id, context) {
        inject_compute_note_hash_and_nullifier(
            crate_id,
            context,
            collected_trait_impls,
            collected_functions,
        )
    } else {
        Ok(())
    }
}

//
//                    Transform Hir Nodes for Aztec
//

/// Completes the Hir with data gathered from type resolution
fn transform_hir(
    crate_id: &CrateId,
    context: &mut HirContext,
) -> Result<(), (AztecMacroError, FileId)> {
    transform_events(crate_id, context)?;
    assign_storage_slots(crate_id, context)
}
