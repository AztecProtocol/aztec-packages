import { css } from '@mui/styled-engine';
import { useDropzone } from 'react-dropzone';
import './dropzone.css';
import { loadContractArtifact } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ListItem from '@mui/material/ListItem';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useContext } from 'react';
import { AztecContext } from '../../../aztecEnv';

const dropZoneContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  border: '3px dashed var(--mui-palette-primary-dark)',
  borderRadius: '15px',
  margin: '2rem 0',
  alignItems: 'center',
  justifyContent: 'center',
});

const uploadIcon = css({
  fontSize: '64px',
  color: 'var(--mui-palette-primary-dark)',
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
        <Typography variant="h5" sx={{ mb: 2, color: 'var(--mui-palette-primary-dark)' }}>
          Upload Contract JSON Artifact
        </Typography>
        <Typography>Drag and drop a contract JSON file here, or click to select a file</Typography>

        <Typography variant="body2" color="text.secondary" sx={{ my: 3 }}>
          <Typography align="left">
            To generate a contract artifact:
          </Typography>

          <ListItem sx={{ p: 0 }}>
            1. Install latest version of Aztec CLI by running `aztec-up`
          </ListItem>
          <ListItem sx={{ p: 0 }}>
            2. Run `aztec-nargo compile` in your project directory
          </ListItem>
          <ListItem sx={{ p: 0 }}>
            3. Look for `{'<your-project-name>'}.json` file in the ./target directory
          </ListItem>
        </Typography>

        <Button
          variant="contained"
          color="primary"
          sx={{ mt: 2, '&:hover': { backgroundColor: 'var(--mui-palette-primary-dark)' } }}
        >
          Select File
        </Button>
      </div>
    </div>
  );
}
