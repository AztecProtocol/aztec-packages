var addon = require("bindings")("world_state_napi");
const fs = require("fs");

const interval = setInterval(() => {
  // console.log("\nRunning...");
}, 1);

(async function main() {
  fs.mkdirSync("./data", { recursive: true });
  const x = new addon.WorldState("./data");

  const printRoots = async (prefix) => {
    const timerLabel = `[${prefix}] Getting roots`;
    console.group(timerLabel);
    console.time(timerLabel + " duration");

    console.time("Committed root duration");
    const committedRoot = x.get_root();
    console.time("Uncommitted root duration");
    const uncommittedRoot = x.get_root(true);

    committedRoot.then((root) => {
      console.log("Committed root:", root);
      console.timeEnd("Committed root duration");
    });
    uncommittedRoot.then((root) => {
      console.log("Uncommitted root:", root);
      console.timeEnd("Uncommitted root duration");
    });

    await Promise.all([committedRoot, uncommittedRoot]);
    console.groupEnd();
    console.timeEnd(timerLabel + " duration");
  };

  await printRoots("Initial");

  const insertLabel = "Inserting leaf";
  console.group(insertLabel);
  console.time(insertLabel + " duration");

  const leaf =
    "0x0000000000000000000000000000000000000000000000000000000000000001";
  console.log("Leaf:", leaf);
  const leafIndex = await x.insert_leaf(leaf);
  console.log("Index:", leafIndex);
  console.timeEnd(insertLabel + " duration");
  console.groupEnd();

  printRoots("After insert");

  console.time("Commit duration");
  await x.commit();
  console.timeEnd("Commit duration");
  printRoots("After commit");

  clearInterval(interval);
})();
