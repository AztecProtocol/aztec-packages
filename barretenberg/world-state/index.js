var addon = require("bindings")("world-state-napi");

console.log(addon.hello()); // 'world'
