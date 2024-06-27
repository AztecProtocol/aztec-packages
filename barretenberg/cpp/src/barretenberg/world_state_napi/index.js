var addon = require("bindings")("world_state_napi");
const fs = require("fs");

fs.mkdirSync("./data", { recursive: true });
const x = new addon.WorldState("./data");
console.log(x.get_root());
