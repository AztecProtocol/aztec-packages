import { css } from '@mui/styled-engine';
import { useDropzone } from 'react-dropzone';
import './dropzone.css';
import { useState } from 'react';
import type { ContractArtifact } from '@aztec/aztec.js';
import { loadContractArtifact } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CircularProgress from '@mui/material/CircularProgress';

const dropZoneContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '80%',
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

const loadingArtifactContainer = css({
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'center',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2rem',
  height: '100%',
});

interface ContractUploadProps {
  onContractLoaded: (artifact: ContractArtifact) => void;
  onDeployRequested: () => void;
  isLoading: boolean;
  wallet: any;
}

export function ContractUpload({ onContractLoaded, onDeployRequested, isLoading, wallet }: ContractUploadProps) {
  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async files => {
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.name.endsWith('.json')) {
        alert('Please upload a JSON file. Other file types are not supported.');
        return;
      }

      const reader = new FileReader();

      reader.onload = async e => {
        try {
          if (!e.target?.result) {
            throw new Error('Could not read the file content');
          }

          const fileContent = e.target.result as string;
          const artifact = JSON.parse(fileContent);
          const contractArtifact = loadContractArtifact(artifact);

          onContractLoaded(contractArtifact);

          if (wallet) {
            setTimeout(() => {
              if (confirm('Would you like to deploy this contract now?')) {
                onDeployRequested();
              }
            }, 500);
          }

        } catch (error) {
          console.error('Error parsing contract artifact:', error);
          alert(`Failed to load contract artifact: ${error.message || 'Unknown error'}`);
        }
      };

      reader.onerror = () => {
        console.error('Error reading file:', reader.error);
        alert('Error reading the uploaded file. Please try again.');
      };

      reader.readAsText(file);
    },
    accept: {
      'application/json': ['.json']
    },
    multiple: false
  });

  if (isLoading) {
    return (
      <div css={loadingArtifactContainer}>
        <Typography variant="h5">Loading artifact...</Typography>
        <CircularProgress style={{ color: '#9894FF' }} size={100} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '1rem' }}>
      <div css={dropZoneContainer}>
        <div {...getRootProps({ className: 'dropzone' })}>
          <input {...getInputProps()} />
          <UploadFileIcon css={uploadIcon} />
          <Typography variant="h5" sx={{ mb: 2, color: '#9894FF' }}>Upload Contract JSON Artifact</Typography>
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
    </div>
  );
}
