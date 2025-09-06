# AVM <> Brillig fuzzer

Coverage guided AVM vs. Brillig fuzzer

## Responsibilities

This package is responsible for providing the functionality of transpiling brillig bytecode and simulating avm bytecode. This functionality complements `brillig` target of [ssa_fuzzer](https://github.com/noir-lang/noir/tree/master/tooling/ssa_fuzzer).

## How this works
1) `ssa_fuzzer` generates SSA, compiles it into Brillig bytecode and executes it.
2) `ssa_fuzzer` sends Brillig bytecode from the step 1 to `transpiler_service` and gets AVM bytecode
3) `ssa_fuzzer` sends AVM bytecode to the [server](./src/server.ts)
4) `ssa_fuzzer` compares the results. If the results do not agree, the fuzzer panics.


## Usage
1) Bootstrap yarn-project as you always do
2) Run `simulator_service` by `node dest/server.js`
3) Run `transpiler_service` by `cd transpiler_service && docker compose up --build -d`
4) Go to Noir repo (TODO(sn): fix when ssa fuzzer merged to noir-repo-ref) checkout to the commit `b1b62e65f0140ea398db060c539178f796305885`.
5) Go to the fuzzer dir and run it. `cd tooling/ssa_fuzzer/fuzzer && cargo +nightly fuzz run --fuzz-dir . brillig   -- -max_len=10000`



## How to triage

Make sure the fuzzer is running on the same version of Noir, avm_transpiler, yarn-project.

### If Noir code given
TL;DR compile bytecode with nargo, send to transpiler_service or craft contract artifact by hands, copy avm bytecode, write test to the `simulator` package

Example:
```noir
fn main(a: u64) -> pub (u64, u64) {
    (kek(a), a)
}

fn kek(a: u64) -> u64 {
   kek2(a) * 2
}

fn kek2(a: u64) -> u64 {
  a * 3
}
```

1) Compile: `nargo compile --force-brillig`
You will get json file:
```
{"noir_version":"1.0.0-beta.11+a92d049c8771332a383aec07474691764c4d90f0-aztec","hash":"7909327615750072643","abi":{"parameters":[{"name":"a","type":{"kind":"integer","sign":"unsigned","width":64},"visibility":"private"}],"return_type":{"abi_type":{"kind":"tuple","fields":[{"kind":"integer","sign":"unsigned","width":64},{"kind":"integer","sign":"unsigned","width":64}]},"visibility":"public"},"error_types":{"7233212735005103307":{"error_kind":"string","string":"attempt to multiply with overflow"},"17843811134343075018":{"error_kind":"string","string":"Stack too deep"}}},"bytecode":"H4sIAAAAAAAA/61UO07DQBCd/dgskSU+DRXSNiBxDwLniERDATXllhyAC1Ag0SBuQQEFDTehoCWWZ+KXseOsk4xkzXr3vTfveaMYaspzv5vd3tt5N2pf3rFkL1JWmRFYspooe2YAbFYQMdwFr0MP1+UbNEHNGMdP10ELjuKTC7ScdxP/wtmATyX3y9TytReCLjjNqe+m4jXerWD25s8BtetDXlfcp6Bl1NlVj7ftcqdpAN/j+WSPqTtftCbUZIzKq1XYSFnljJplmY/fSuvXTyECgHcDePHvAV8oDMGZ4E+415nPaSeZrfZkMzOUPZn9AL6gbuYSMA7OEX9K3czVihl4hveFvxf5H/FpeXaknHpY6LrU9IJa71ii7xX+jN/3wR/6jDRcf8+/7y9vP59Hil+XfI/JFvo3s8fXj++nr3X6/5/ATrYJBwAA","debug_symbols":"pZLLjoQgEEX/pdYs5NHj41c6xqBih4SgoWGSieHfpxCd0YWr3nAsy1PXhFphVH14ddpO8xua5wq908boV2fmQXo9W3y7QpEOWkLDCdAqo97AigyawTI4NAIhMh4ZXxllBk4RMRI4cjrvlEoxp2D8nUU6ZT00NhhD4FuasH30XqTd6KXDbkFA2RGJAydtVHqK5N8u7lVBd1eUf/LjatN7u2K7XdV3Nru3KRO7Tln9SXrNL3aLlRy0u1xiTHOclr1RezkFO5y6/mc5OscSLG4e1BicSpNOm4DnkzPCyxYXgaaiIqJoY4r+BQ==","file_map":{"50":{"source":"fn main(a: u64) -> pub (u64, u64) {\n    (kek(a), a)\n}\n\nfn kek(a: u64) -> u64 {\n   kek2(a) * 2\n}\n\nfn kek2(a: u64) -> u64 {\n  a * 3\n}\n","path":"/home/defkit/temp/src/main.nr"}},"expression_width":{"Bounded":{"width":4}}}
```
2) Copy bytecode from the json and send it to the transpiler service OR craft contract artifact by hands

The example of crafting contract artifact by hands in [transpiler_service](./transpiler_service/main.py)
Then in `avm_transpiler`: `cargo run CRAFTED_ARTIFACT.json output.json`
You will get json file
```
{"transpiled":true,"noir_version":"1.0.0-beta.11+a92d049c8771332a383aec07474691764c4d90f0-aztec","name":"AvmTest","functions":[{"name":"main2","is_unconstrained":true,"custom_attributes":["public"],"abi":{"parameters":[{"name":"a","type":{"kind":"integer","sign":"unsigned","width":64},"visibility":"private"}],"return_type":{"abi_type":{"kind":"integer","sign":"unsigned","width":64},"visibility":"public"},"error_types":{"17843811134343075018":{"error_kind":"string","string":"Stack too deep"}}},"bytecode":"JwACBAEoAAABBIBHJwAABAMnAgIEAScCAwQAHwoAAgADgEQdAIBEgEQFLgiARAABJQAAAFglAAAAWS4CAAGARS4CAAKARigCAAMEgEUnAgQEAjsOAAQAAyYlAAAAqScCAgUDBCoBAgMGKgMCBQoqBQEEJAIABAAAAH8lAAAA0icCAgUCBCoDAgQGKgQCBgoqBgMFJAIABQAAAKAlAAAA0i0KAQItCgQBJigAgAQEeAANAAAAgASAAyQAgAMAAADRKgEAAQX3ofOvpa3UyjwEAgEmKgEAAQVkYYioxs+UyzwEAgEm","debug_symbols":"dVDNDoMgDH6Xnjkomdv0VYwxiNWQECAISxbDu68Yne6wS7+W74e0K4w4xLlXZrILNO0Kg1daq7nXVoqgrKHXFYpcnjU0JYP6RpASg0PRB4+YBRcLBTnh0QRoTNSawUvouIkWJ8yGQXhiCwZoRkIKnJTG3CV2uov/1rKs7s/dTv2DfyN4lVJHk5DK/yyScppXYtC4j1M08sKGtzuY4xDOW4lj9JiTzmuUVFteMF51Kf/2AQ=="},{"name":"public_dispatch","is_unconstrained":true,"custom_attributes":["public"],"abi":{"parameters":[{"name":"selector","type":{"kind":"field"},"visibility":"private"}],"return_type":null,"error_types":{"1752556835457866331":{"error_kind":"string","string":"No public functions"}}},"bytecode":"JwAABAEqAAABBRhSVSgKJhpbPAAAAQ==","debug_symbols":"XY1bCoAgEEX3Mt+toK1EiI9RBkRl0iDEvWeRIH3ee+6jgkFVnKBg4wHrVkExeU9O+Khlphi6W9sCQ4rMiN2CiW97D0hN/C+dkkkqj5+0JeiJ5isNMk4TR42mMD5LL2t7uwE="}],"outputs":{},"file_map":{}}
```

3) Copy avm bytecode from the json on the step 2. Go to [avm_simulator.test.ts](../simulator/src/public/avm/avm_simulator.test.ts) and add test

```js
  it('test_bytecode_base64', async () => {
    const calldata: Fr[] = [new Fr(2)];
    // the same bytecode as in json on step 2
    const bytecodeBase64 =
      'JwACBAEoAAABBIBHJwAABAMnAgIEAScCAwQAHwoAAgADgEQdAIBEgEQFLgiARAABJQAAAFglAAAAWS4CAAGARS4CAAKARigCAAMEgEUnAgQEAjsOAAQAAyYlAAAAqScCAgUDBCoBAgMGKgMCBQoqBQEEJAIABAAAAH8lAAAA0icCAgUCBCoDAgQGKgQCBgoqBgMFJAIABQAAAKAlAAAA0i0KAQItCgQBJigAgAQEeAANAAAAgASAAyQAgAMAAADRKgEAAQX3ofOvpa3UyjwEAgEmKgEAAQVkYYioxs+UyzwEAgEm';
    const bytecode = Buffer.from(bytecodeBase64, 'base64');
    const context = initContext({ env: initExecutionEnvironment({ calldata }) });
    const results = await new AvmSimulator(context).executeBytecode(bytecode);

    expect(results.reverted).toBe(false);
    // 2 * 3 * 2 == 2 (see noir code above)
    // the second output is just calldata[0]
    expect(results.output).toEqual([new Fr(12), new Fr(2)]);
  });
```
4) Run test `yarn test avm_simulator`

### If SSA given
TODO(sn): implement functionality to get bytecode from `ssa_executor`
