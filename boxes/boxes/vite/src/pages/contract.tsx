import { useState } from "react";
import { Contract } from "@aztec/aztec.js";
import { useNumber } from "../hooks/useNumber";

const IGNORE_FUNCTIONS = ["constructor", "process_log", "sync_notes"];

export function ContractComponent({ contract }: { contract: Contract }) {
  const [showInput, setShowInput] = useState(true);
  const { wait, getNumber, setNumber } = useNumber({ contract });

  const filteredInterface = contract.artifact.functions.filter(
    (f) => !IGNORE_FUNCTIONS.includes(f.name),
  );

  return (
    <div>
      <h1>Your Contract</h1>
      <form onSubmit={getNumber}>
        <label htmlFor="viewFunctions">View Functions:</label>
        <select name="viewFunctions" id="viewFunctions">
          {filteredInterface.map(
            (fn, index) =>
              fn.functionType === "unconstrained" && (
                <option key={index} value={index}>
                  {fn.name}
                </option>
              ),
          )}
        </select>
        <button type="submit" disabled={wait}>
          Read
        </button>
      </form>

      <form onSubmit={setNumber}>
        <label htmlFor="functions">Functions:</label>
        <select
          name="functions"
          id="functions"
          onChange={() => setShowInput(true)}
        >
          {filteredInterface.map(
            (fn, index) =>
              fn.functionType !== "unconstrained" && (
                <option key={index} value={index}>
                  {fn.name}
                </option>
              ),
          )}
        </select>
        <input
          type="number"
          name="numberToSet"
          id="numberToSet"
          hidden={!showInput}
        />
        <button type="submit" disabled={wait}>
          Write
        </button>
      </form>
    </div>
  );
}
