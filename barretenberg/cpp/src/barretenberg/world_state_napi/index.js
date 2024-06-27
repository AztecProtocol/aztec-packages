var addon = require("bindings")("world_state_napi");

const x = new addon.WorldState("ctor");
console.log(x.greet("greet fn"));
