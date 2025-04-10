import { css } from '@mui/styled-engine';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { DeployContractDialog } from './DeployContractDialog';
import { RegisterContractDialog } from './RegisterContractDialog';

const headerSection = css({
  width: '100%',
  marginBottom: '24px',
});

const descriptionText = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '18px',
  lineHeight: '120%',
  display: 'flex',
  alignItems: 'center',
  textAlign: 'center',
  color: '#000000',
  marginBottom: '25px',
  width: '100%',
});

const buttonContainer = css({
  display: 'flex',
  justifyContent: 'center',
  gap: '24px',
  marginBottom: '25px',
});

const actionButton = css({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '20px 32px',
  gap: '8px',
  width: '230px',
  height: '56px',
  background: '#CDD1D5',
  borderRadius: '12px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: '#000000',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  },
});

interface ContractHeaderProps {
  selectedPredefinedContract: string;
  nodeURL: string;
  contractArtifact: any;
  onDeployRequested: () => void;
  onRegisterRequested: () => void;
  openDeployContractDialog: boolean;
  openRegisterContractDialog: boolean;
  onDeployClose: (contract?: any, alias?: string) => void;
  onRegisterClose: (contract?: any, alias?: string) => void;
}

export function ContractHeader({
  selectedPredefinedContract,
  nodeURL,
  contractArtifact,
  onDeployRequested,
  onRegisterRequested,
  openDeployContractDialog,
  openRegisterContractDialog,
  onDeployClose,
  onRegisterClose,
}: ContractHeaderProps) {
  return (
    <div css={headerSection}>
      <div css={descriptionText}>
        {selectedPredefinedContract === 'simple_voting' ? (
          <>
            On this page you can simulate transactions in this contract and send them to the network.
            <br />
            This contract allows a person to vote privately on a public vote.
          </>
        ) : selectedPredefinedContract === 'simple_token' ? (
          <>
            On this page you can simulate transactions in this contract and send them to the network.
            <br />
            This is a simple token contract demonstrating holding it both publicly and privately, and being able to
            transfer publicly and privately, and move it in and out of state publicly and privately.
          </>
        ) : (
          <>On this page you can simulate transactions in this contract and send them to the network.</>
        )}
      </div>
      <div css={buttonContainer}>
        <Button css={actionButton} onClick={onDeployRequested} disabled={!nodeURL}>
          Deploy
        </Button>
        <Button css={actionButton} onClick={() => window.open('https://docs.aztec.network/', '_blank')}>
          Go to Docs
        </Button>
        <DeployContractDialog
          contractArtifact={contractArtifact}
          open={openDeployContractDialog}
          onClose={onDeployClose}
        />
        <RegisterContractDialog
          contractArtifact={contractArtifact}
          open={openRegisterContractDialog}
          onClose={onRegisterClose}
        />
      </div>
    </div>
  );
}
