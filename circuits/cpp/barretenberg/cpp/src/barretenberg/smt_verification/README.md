# Building cvc5

TODO(alex): update the docunmentation after all the fixes

As for now it's required to build cvc5 library manually.

<!-- 
- navigate yourself into barratenberg/cpp/src/cvc5 directory
- run `./configure.sh production --auto-download --cocoa --cryptominisat -DCMAKE_C_COMPILER=/usr/bin/clang -DCMAKE_CXX_COMPILER=/usr/bin/clang++ --prefix="./tmp-lib"`
- `cd build && make -j4`
- `make install` 
-->

- inside your home repository do `git clone git@github.com:Sarkoxed/cvc5.git` (temporarily, since they have been merging my patch for a month now)
- inside the cvc5 repo: 
    - `git checkout finite-field-base-support`
    - `./configure.sh production --auto-download --cocoa --cryptominisat -DCMAKE_C_COMPILER=/usr/bin/clang -DCMAKE_CXX_COMPILER=/usr/bin/clang++ --prefix="./tmp-lib"`
    - `cd build && make`
    - `make install`

Now you can import it using <cvc5/cvc5.h>

# How to use smt_circuit library

## 1. Setting variable names during circuit creation and exporting the circuit.

### There're five new methods inside (for now standard) circuit_builder

- ```set_variable_name(u32 index, str name)``` - assignes a name to a variable. Specifically, binds a name with the first index of an equivalence class.

- ```update_variable_names(u32 idx)``` - in case you've called ```assert_equal``` and ```update_real_variable_indices``` somewhere and you know that two or more variables from the equivalence class have separate names, call this method. Idx is the index of one of the variables of this class. The name of the first variable in class will remain.

- ```finalize_variable_names()``` - in case you don't want to mess with previous method, this one finds all the collisions and removes them.

- ```export_circuit()``` - exports all variables, gates, and assigned names to an msgpack-compatible buffer namely `msgpack::sbuffer`.

To store it on the disk just do 

```cpp
    msgpack::sbuffer buffer = circuit.export_circuit();
    
    std::fstream myfile;
    myfile.open("fname.pack", std::ios::out | std::ios::trunc | std::ios::binary);

    myfile.write(buffer.data(), static_cast<long>(buffer.size()));
    myfile.close();
```

## 2. Symbolic Circuit initialization and term creation

1. First you need to import the circuit from the saved file or from the buffer:

	- `smt_circuit::CircuitSchema c_info = smt_circuit::unpack_from_file(str fname);`

  	- `smt_circuit::CircuitSchema c_info = smt_circuit::unpack_from_buffer(msgpack::sbuffer buf);`


2. Initialize the Solver:

	`smt_solver::Solver s(str modulus, bool produce_model=false, u32 base=16, u64 timeout)`
	
	!note that there should be no "0x" part in the modulus hex representation if you put it manually. Otherwise you can use CircuitSchema.modulus member.
	
	`produce_model` flag should be initialized as true if you want to check the values obtained using the solver when the result of the check does not meet your expectations. **All the public variables will be constrained to be equal their real value**.
	
	`base` can be any positive integer, it will mostly bee 10 or 16, I guess.

    `timeout` solver timeout in milliseconds
	
3. Initialize the Circuit 

	From now and on we will use `smt_terms::FFTerm` and `smt_terms::Bool` types to operate inside the solver. 
    
    `FFTerm` - the symbolic value that simulates finite field elements. 
    
    `Bool` - simulates the boolean values and mostly will be used only to simulate `if` statements if needed.
	
	- ```smt_circuit::Circuit circuit(CircuitSchema c_info, Solver* s, str tag="")```
	
	    It will generate all the symbolic values of the circuit wires values, add all the gate constrains, create a map `string->FFTerm`.
        In case you want to create two similar circuits with the same solver and schema, then you should specify the tag(name) of a circuit. 

	Then you can get the previously named variables via `circuit[name]`.
    Or if you want to check the value without the name you can simply call `circuit[idx]`.
4. Terms creation

	You are able to create two types of ff terms:
	- `FFTerm Var(str name, Solver* s)`  - creates a symbolic finite field variable
	- `FFTerm Const(str val, Solver*  s, u32 base=16)` - creates a numeric value.

	You can add, subtract, multiply and divide these variables(including !+, !-, etc);
	Also there are two functions :
	- `batch_add(std::vector<FFTerm>& terms)`
	- `batch_mul(std::vector<FFTerm>& terms)` 
	to create an addition/multiplication Term in one call
	
	You can create a constraint `==` or `!=` that will be included directly into solver.	
	
	Also there is a Bool type:
	- `Bool Bool(FFTerm t)` or `Bool Bool(bool b, Solver* s)`

	You can `|, &, ==, !=` these variables and also `batch_or`, `batch_and` them.
	To create a constrain you should call `assert_term` method.
	
	The way I see the use of Bool types is to create terms like `(a == b && c == 1) || (a != b && c == 0)`, `(a!=1)||(b!=2)|(c!=3)` and of course more sophisticated ones.
5. Post model checking

	After generating all the constrains you should call `bool res = solver.check()` and depending on your goal it could be `true` or `false`.
	
	In case you expected `false` but `true` was returned you can then check what went wrong.
	You should generate an unordered map with `str->term` values and ask the solver to obtain `unoredered_map<str, str> res = solver.model(unordered_map<str, FFTerm> terms)`. 
	Now you have the values of the specified terms, which resulted into `true` result. 

6. Automated verification of a unique witness

    There's also a function `pair<Circuit, Circuit> unique_witness(CircuitSchema circuit_info, Solver* s, vector<str> inputs, vector<str> outputs)` that will create two separate circuits and constrain their inputs to be eqal and outputs to be not. Then later you can run `s.check()` and `s.model()` if you wish.

## 3. Simple examples

```cpp
    StandardCircuitBuilder builder = StandardCircuitBuilder();

    field_t a(witness_t(&builder, fr::random_element()));
    field_t b(witness_t(&builder, fr::random_element()));
    field_t c = (a + a) / (b + b + b);

    builder.set_variable_name(a.witness_index, "a");
    builder.set_variable_name(b.witness_index, "b");
    builder.set_variable_name(c.witness_index, "c");
    ASSERT_TRUE(builder.check_circuit());

    auto buf = builder.export_circuit();

    smt_circuit::CircuitSchema circuit_info = smt_circuit::unpack_from_buffer(buf);
    smt_solver::Solver s(circuit_info.modulus, true, 10);
    smt_circuit::Circuit circuit(circuit_info, &s);
    smt_terms::FFTerm a1 = circuit["a"];
    smt_terms::FFTerm b1 = circuit["b"];
    smt_terms::FFTerm c1 = circuit["c"];
    smt_terms::FFTerm two = smt_terms::Const("2", &s, 10);
    smt_terms::FFTerm thr = smt_terms::Const("3", &s, 10);
    smt_terms::FFTerm cr = smt_terms::Var("cr", &s);
    cr = (two * a1) / (thr * b1);
    c1 != cr;

    bool res = s.check();
    ASSERT_FALSE(res);
}
```

```cpp
    StandardCircuitBuilder builder = StandardCircuitBuilder();

    field_t a(witness_t(&builder, fr::random_element()));
    field_t b(witness_t(&builder, fr::random_element()));
    field_t c = (a) / (b + b + b); // mistake was here

    builder.set_variable_name(a.witness_index, "a");
    builder.set_variable_name(b.witness_index, "b");
    builder.set_variable_name(c.witness_index, "c");
    ASSERT_TRUE(builder.check_circuit());

    auto buf = builder.export_circuit();

    smt_circuit::CircuitSchema circuit_info = smt_circuit::unpack_from_buffer(buf);
    smt_solver::Solver s(circuit_info.modulus, true);
    smt_circuit::Circuit circuit(circuit_info, &s);

    smt_terms::FFTerm a1 = circuit["a"];
    smt_terms::FFTerm b1 = circuit["b"];
    smt_terms::FFTerm c1 = circuit["c"];

    smt_terms::FFTerm two = smt_terms::Const("2", &s, 10);
    smt_terms::FFTerm thr = smt_terms::Const("3", &s, 10);
    smt_terms::FFTerm cr = smt_terms::Var("cr", &s);
    cr = (two * a1) / (thr * b1);
    c1 != cr;

    bool res = s.check();
    ASSERT_TRUE(res);

    std::unordered_map<std::string, cvc5::Term> terms({ { "a", a1 }, { "b", b1 }, { "c", c1 }, { "cr", cr } });

    std::unordered_map<std::string, std::string> vals = s.model(terms);

    info("a = ", vals["a"]);
    info("b = ", vals["b"]);
    info("c = ", vals["c"]);
    info("c_res = ", vals["cr"]);
}
```

```cpp
    StandardCircuitBuilder builder = StandardCircuitBuilder();

    field_t a(pub_witness_t(&builder, fr::random_element()));
    field_t b(pub_witness_t(&builder, fr::random_element()));
    info("a = ", a);
    info("b = ", b);
    builder.set_variable_name(a.witness_index, "a");
    builder.set_variable_name(b.witness_index, "b");
    field_t z(witness_t(&builder, fr::random_element()));
    field_t ev = z * z + a * z + b;
    info("ev = ", ev);
    builder.set_variable_name(z.witness_index, "z");
    builder.set_variable_name(ev.witness_index, "ev");

    auto buf = builder.export_circuit();

    smt_circuit::CircuitSchema circuit_info = smt_circuit::unpack_from_buffer(buf);
    smt_solver::Solver s(circuit_info.modulus, {true, 0});

    std::pair<smt_circuit::Circuit<smt_terms::FFTerm>, smt_circuit::Circuit<smt_terms::FFTerm>> cirs =
        smt_circuit::unique_witness(circuit_info, &s, { "ev" }, { "z" });

    bool res = s.check();
    ASSERT_TRUE(res);
    for (auto x : s.s.getAssertions()) {
        info(x);
        info();
    }

    std::unordered_map<std::string, cvc5::Term> terms = { { "z_c1", cirs.first["z"] }, { "z_c2", cirs.second["z"] } };
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info(vals["z_c1"]);
    info(vals["z_c2"]);
```
More examples can be found in *.test.cpp files
