"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acirToUint8Array = void 0;
const fflate_1 = require("fflate");
const base64_decode_js_1 = require("./base64_decode.js");
// Converts bytecode from a base64 string to a Uint8Array
function acirToUint8Array(base64EncodedBytecode) {
    const compressedByteCode = (0, base64_decode_js_1.base64Decode)(base64EncodedBytecode);
    return (0, fflate_1.decompressSync)(compressedByteCode);
}
exports.acirToUint8Array = acirToUint8Array;
