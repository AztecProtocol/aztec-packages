import { createPXEClient } from "@aztec/aztec.js";

const pxe = createPXEClient("http://10.10.1.79:8080");
const nodeInfo = await pxe.getNodeInfo();
console.log(nodeInfo);
