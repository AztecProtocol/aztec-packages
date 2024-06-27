var addon = require("bindings")("world_state_napi");
const fs = require("fs");

fs.mkdirSync("./data", { recursive: true });
const x = new addon.WorldState("./data");
// console.log(x.get_root());
console.log("\n\n\nbefore call");
x.get_root()
  .then((x) => {
    console.log("done", x);
  })
  .catch((e) => {
    console.log("error", e);
  });

console.log("after promise");
