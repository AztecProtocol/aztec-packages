import { css } from "@emotion/react";
import { useDropzone } from "react-dropzone";
import "./dropzone.css";
import { useState } from "react";
import { ContractArtifact, loadContractArtifact } from "@aztec/aztec.js";

const container = css({
  display: "flex",
  height: "100vh",
  width: "75vw",
  overflow: "hidden",
  justifyContent: "center",
  alignItems: "center",
});

const dropZoneContainer = css({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "80%",
  border: "5px dashed black",
  borderRadius: "15px",
  margin: "5rem",
});

const contractFnContainer = css({});

export function ContractComponent() {
  const [contractArtifact, setContractArtifact] =
    useState<ContractArtifact | null>(null);
  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (files) => {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const contractArtifact = loadContractArtifact(
          JSON.parse(e.target?.result as string)
        );
        setContractArtifact(contractArtifact);
      };
      reader.readAsText(file);
    },
  });

  return (
    <div css={container}>
      {!contractArtifact ? (
        <div css={dropZoneContainer}>
          <div {...getRootProps({ className: "dropzone" })}>
            <input {...getInputProps()} />
            <p>Drag 'n' drop some files here, or click to select files</p>
          </div>
        </div>
      ) : (
        <div>{contractArtifact?.name}</div>
      )}
    </div>
  );
}
