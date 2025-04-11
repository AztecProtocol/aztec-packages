import { css } from '@mui/styled-engine';
import { useDropzone } from 'react-dropzone';
import './dropzone.css';
import { loadContractArtifact } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useContext } from 'react';
import { AztecContext } from '../../../aztecEnv';

const dropZoneContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  border: '3px dashed #9894FF',
  borderRadius: '15px',
  margin: '2rem 0',
  backgroundColor: 'rgba(152, 148, 255, 0.04)',
  alignItems: 'center',
  justifyContent: 'center',
});

const uploadIcon = css({
  fontSize: '64px',
  color: '#9894FF',
  marginBottom: '1rem',
});

export function ContractUpload() {
  const { setCurrentContractArtifact } = useContext(AztecContext);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async files => {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = async e => {
        const contractArtifact = loadContractArtifact(JSON.parse(e.target?.result as string));
        setCurrentContractArtifact(contractArtifact);
      };
      reader.readAsText(file);
    },
    accept: {
      'application/json': ['.json'],
    },
    multiple: false,
  });

  return (
    <div css={dropZoneContainer}>
      <div {...getRootProps({ className: 'dropzone' })}>
        <input {...getInputProps()} />
        <UploadFileIcon css={uploadIcon} />
        <Typography variant="h5" sx={{ mb: 2, color: '#9894FF' }}>
          Upload Contract JSON Artifact
        </Typography>
        <Typography>Drag and drop a contract JSON file here, or click to select a file</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, mb: 3, display: 'block' }}>
          The contract artifact should be a JSON file exported from your Noir/Aztec project
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 2, backgroundColor: '#9894FF', '&:hover': { backgroundColor: '#8C7EFF' } }}
        >
          Select File
        </Button>
      </div>
    </div>
  );
}
