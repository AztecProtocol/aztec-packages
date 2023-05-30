// // contract ZkNFT {
//     mod storage;
//     use storage::Storage;
//     use storage::new_singleton_over_owner_notes;
//     use dep::aztec3::abi::Inputs;
//     use dep::aztec3::context::PrivateFunctionContext;
//     use dep::aztec3::notes::owner_note::OwnerNote;
//     use dep::aztec3::notes::owner_note::NOTE_LEN;
//     use dep::aztec3::types::point::Point;
//     // use dep::aztec3::state_vars::map::Map;
//     use dep::aztec3::state_vars::singleton::Singleton;


// // ---

//     fn new_concrete_c_over_d() -> C<D> {
//         let d_method_interface = get_d_method_interface();
//         C::new(d_method_interface)
//     }

// // ---

//     // Storage
//     struct A {
//         b: B<C<D>>,
//     }

//     impl A {
//         fn new() -> Self {
//             A {
//                 b: B::new(new_concrete_c_over_d)
//             }
//         }
//     }

// // ---

//     // Map<V>
//     struct B<T_C> {
//         new_concrete_t_c_constructor: fn()->T_C,
//     }

//     impl<T_C> B<T_C> {
//         fn new(new_concrete_t_c_constructor: fn () -> T_C) -> B<T_C> {
//             B { new_concrete_t_c_constructor }
//         }

//         fn get_t_c(self) -> T_C {
//             let new_concrete_t_c_constructor = self.new_concrete_t_c_constructor;
//             new_concrete_t_c_constructor()
//         }
//     }

// // ---

//     // Set<Note>
//     struct C<T_D> {
//         t_d_interface: MethodInterface<T_D>,
//     }

//     impl<T_D> C<T_D> {
//         fn new (t_d_interface: MethodInterface<T_D>) -> Self {
//             C { t_d_interface }
//         }

//         fn call_method_of_t_d(self, t_d: T_D) -> Field {
//             let some_method_on_t_d = self.t_d_interface.some_method_on_t_d;
//             some_method_on_t_d(t_d)
//         }
//     }

// // ---

//     struct MethodInterface<T_D> {
//         some_method_on_t_d: fn(T_D)->Field,
//     }

// // ---

//     // Note
//     struct D {
//         d: Field,
//     }

//     fn d_method(input: D) -> Field {
//         input.d * input.d
//     }

//     fn get_d_method_interface() -> MethodInterface<D> {
//         MethodInterface {
//             some_method_on_t_d: d_method,
//         }
//     }  

// // ---  

//     fn main(input: Field) -> pub Field {
//         let a: A = A::new(); // Storage
//         let b: B<C<D>> = a.b; // Map
//         let c: C<D> = b.get_t_c(); // Singleton<Note>
//         let d: D = D { d: input }; // Note
//         let output = c.call_method_of_t_d(d);

//         output
//     }

// ********************************************************
// // ---

//     fn new_concrete_c_over_d() -> C<D> {
//         let d_method_interface = get_d_method_interface();
//         C::new(d_method_interface)
//     }

// // ---

//     // Map<V>
//     struct B<T_C> {
//         new_concrete_t_c_constructor: fn()->T_C,
//     }

//     impl<T_C> B<T_C> {
//         fn new(new_concrete_t_c_constructor: fn () -> T_C) -> B<T_C> {
//             B { new_concrete_t_c_constructor }
//         }

//         fn get_t_c(self) -> T_C {
//             let new_concrete_t_c_constructor = self.new_concrete_t_c_constructor;
//             new_concrete_t_c_constructor()
//         }
//     }

// // ---

//     // Set<Note>
//     struct C<T_D> {
//         t_d_interface: MethodInterface<T_D>,
//     }

//     impl<T_D> C<T_D> {
//         fn new (t_d_interface: MethodInterface<T_D>) -> Self {
//             C { t_d_interface }
//         }

//         fn call_method_of_t_d(self, t_d: T_D) -> Field {
//             let some_method_on_t_d = self.t_d_interface.some_method_on_t_d;
//             some_method_on_t_d(t_d)
//         }
//     }

// // ---

//     struct MethodInterface<T_D> {
//         some_method_on_t_d: fn(T_D)->Field,
//     }

// // ---

//     // Note
//     struct D {
//         d: Field,
//     }

//     fn d_method(input: D) -> Field {
//         input.d * input.d
//     }

//     fn get_d_method_interface() -> MethodInterface<D> {
//         MethodInterface {
//             some_method_on_t_d: d_method,
//         }
//     }  

// // ---  

//     fn main(input: Field) -> pub Field {
//         let b: B<C<D>> = B::new(new_concrete_c_over_d);
//         let c: C<D> = b.get_t_c(); // Singleton<Note>
//         let d: D = D { d: input }; // Note
//         let output = c.call_method_of_t_d(d);

//         output
//     }

// // ---

// ********************************************************

// // ---

//     // Map<V>
//     struct B<T_C> {
//         new_concrete_t_c_constructor: fn()->T_C,
//     }

//     impl<T_C> B<T_C> {
//         fn new(new_concrete_t_c_constructor: fn () -> T_C) -> B<T_C> {
//             B { new_concrete_t_c_constructor }
//         }

//         fn get_t_c(self) -> T_C {
//             let new_concrete_t_c_constructor = self.new_concrete_t_c_constructor;
//             new_concrete_t_c_constructor()
//         }
//     }

// // ---

//     // Set<Note>
//     struct C<T_D> {
//         t_d_interface: D_MethodInterface<T_D>,
//     }

//     impl<T_D> C<T_D> {
//         fn new (t_d_interface: D_MethodInterface<T_D>) -> Self {
//             C { t_d_interface }
//         }

//         fn get_d_methods(self) -> D_MethodInterface<T_D> {
//             let t_d_interface = self.t_d_interface;
//             t_d_interface
//         }
//     }

//     fn new_concrete_c_over_d() -> C<D> {
//         let d_method_interface = get_d_method_interface();
//         C::new(d_method_interface)
//     }

// // ---

//     struct D_MethodInterface<T_D> {
//         some_method_on_t_d: fn(T_D)->Field,
//     }

// // ---

//     // Note
//     struct D {
//         d: Field,
//     }

//     fn d_method(input: D) -> Field {
//         input.d * input.d
//     }

//     fn get_d_method_interface() -> D_MethodInterface<D> {
//         D_MethodInterface {
//             some_method_on_t_d: d_method,
//         }
//     }  

// // ---  

//     fn main(input: Field) -> pub Field {
//         let b: B<C<D>> = B::new(new_concrete_c_over_d);
//         let c: C<D> = b.get_t_c();

//         let d_method_interface = c.get_d_methods();
//         let d_method = d_method_interface.some_method_on_t_d;
//         let d: D = D { d: input };
//         let output = d_method(d);

//         output
//     }

// // ---
// ********************************************************

 // // ---

    // Map<V>
    struct B<T_C> {
        new_concrete_t_c_constructor: fn()->T_C,
    }

    impl<T_C> B<T_C> {
        fn new(new_concrete_t_c_constructor: fn () -> T_C) -> B<T_C> {
            B { new_concrete_t_c_constructor }
        }

        fn get_t_c(self) -> T_C {
            let new_concrete_t_c_constructor = self.new_concrete_t_c_constructor;
            new_concrete_t_c_constructor()
        }
    }

// ---

    // Set<Note>
    struct C<T_D> {
        t_d_interface: D_MethodInterface<T_D>,
    }

    impl<T_D> C<T_D> {
        fn new (t_d_interface: D_MethodInterface<T_D>) -> Self {
            C { t_d_interface }
        }

        fn get_d_methods(self) -> D_MethodInterface<T_D> {
            let t_d_interface = self.t_d_interface;
            t_d_interface
        }
    }

    fn new_concrete_c_over_d() -> C<D> {
        let d_method_interface = get_d_method_interface();
        C::new(d_method_interface)
    }

// ---

    struct D_MethodInterface<T_D> {
        some_method_on_t_d: fn(T_D)->Field,
    }

// ---

    // Note
    struct D {
        d: Field,
    }

    fn d_method(input: D) -> Field {
        input.d * input.d
    }

    fn get_d_method_interface() -> D_MethodInterface<D> {
        D_MethodInterface {
            some_method_on_t_d: d_method,
        }
    }  

// ---  

    fn main(input: Field) -> pub Field {
        let b: B<C<D>> = B::new(new_concrete_c_over_d);
        let c: C<D> = b.get_t_c();

        let d_method_interface = c.get_d_methods();
        let d_method = d_method_interface.some_method_on_t_d;
        let d: D = D { d: input };
        let output = d_method(d);

        output
    }

// ---

// ---

    // // MINT
    // fn main(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: pub Inputs,
    //     //*********************************/
    //     amount: pub Field, 
    //     owner: pub Point, 
    // ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
    //     let mut context = PrivateFunctionContext::new();
    //     context.args = context.args.push_array([amount, owner.x, owner.y]);

    //     let balances = Storage::init().balances;

    //     context.args = context.args.push(balances.storage_slot);
        
    //     // TODO: open an issue for this!
    //     let owner_balance: Singleton<OwnerNote, NOTE_LEN> = balances.at(owner.x);

    //     context.args = context.args.push(owner_balance.storage_slot);


    //     // // Prevents this singleton from ever being initialised again.
    //     context = owner_balance.initialise(context);

    //     let owner_note = OwnerNote::new(owner);
    //     context.args = context.args.push(owner_note.owner.x);


    //     context = owner_balance.insert(context, owner_note);

    //     context.finish(inputs)
    // }

    // TRANSFER
    // fn main(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: pub Inputs,
    //     //*********************************/
    //     amount: pub Field, 
    //     sender: pub Point, 
    //     recipient: pub Point,
    // ) -> pub [Field; dep::aztec3::abi::PUBLIC_INPUTS_LENGTH] {
    //     let mut initialContext = PrivateFunctionContext::new();
    //     initialContext.args = initialContext.args.push_array([amount, sender.x, sender.y, recipient.x, recipient.y]);

    //     let balances = Storage::init().balances;

    //     let sender_balance: Singleton = balances.at(sender.x);
    //     let (mut context, old_note) = sender_balance.get(inputs, initialContext);

    //     // TODO: Removing this return breaks the circuit (???)
    //     // context.return_values = context.return_values.push(note1.is_real as Field);
    //     // context.return_values = context.return_values.push(note2.is_real as Field);

    //     old_note.owner.constrain_equal(sender);

    //     context = sender_balance.remove(inputs, context, old_note);

    //     let recipient_note = ValueNote::new(amount, recipient);

    //     let recipient_balance: Singleton = balances.at(recipient.x);

    //     context = recipient_balance.insert(context, recipient_note);

    //     context.finish(inputs)
    // }
// }
