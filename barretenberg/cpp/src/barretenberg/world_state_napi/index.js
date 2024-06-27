var addon = require("bindings")("world_state_napi");

console.log(addon.hello()); // 'world'
