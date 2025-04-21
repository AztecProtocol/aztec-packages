import { css } from '@mui/styled-engine';

// Base styles
const baseButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px 20px',
  gap: '9px',
  height: '38px',
  background: '#9894FF',
  borderRadius: '8px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '16px',
  lineHeight: '19px',
  color: '#000000',
  border: 'none',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#8C7EFF',
  },
  '&:disabled': {
    backgroundColor: '#CDD1D5',
    color: '#808080',
    cursor: 'not-allowed',
  }
});

const baseLabel = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '6px 16px',
  gap: '10px',
  background: '#9894FF',
  borderRadius: '30px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '12px',
  lineHeight: '120%',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#FFFFFF',
  marginBottom: '10px',
});

// Layout styles
export const container = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: '#E9E9E9',
  borderRadius: '10px',
  padding: '45px',
  overflow: 'hidden',
  '@media (max-width: 1100px)': {
    width: 'auto',
    padding: '24px',
  },
});

export const headerSection = css({
  width: '100%',
  marginBottom: '24px',
});

export const descriptionText = css({
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

export const buttonContainer = css({
  display: 'flex',
  justifyContent: 'center',
  gap: '24px',
  marginBottom: '25px',
});

export const actionButton = css({
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
  }
});

export const dropZoneContainer = css({
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

export const uploadIcon = css({
  fontSize: '64px',
  color: '#9894FF',
  marginBottom: '1rem',
});

export const contractFnContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  flex: '1 1 auto',
  height: '0',
  minHeight: '0',
  overflow: 'auto',
});

export const tokenSection = css({
  marginTop: '50px',
  marginBottom: '25px',
});

export const tokenHeader = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 700,
  fontSize: '48px',
  lineHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.02em',
  color: '#2D2D2D',
  marginBottom: '25px',
});

export const searchContainer = css({
  width: '361px',
  height: '36px',
  background: 'rgba(250, 250, 250, 0.93)',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  padding: '8px',
  marginBottom: '15px',
});

export const filterContainer = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '7px',
  marginBottom: '25px',
});

export const filterButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '6px 5px',
  gap: '11px',
  height: '36px',
  background: '#CDD1D5',
  borderRadius: '6px',
  cursor: 'pointer',
  position: 'relative',
});

export const filterCheckbox = css({
  width: '24px',
  height: '24px',
  background: '#CDD1D5',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '6px',
  marginLeft: '5px',
});

export const filterLabel = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '16px',
  lineHeight: '19px',
  textAlign: 'center',
  color: '#000000',
});

export const filterHelpIcon = css({
  fontSize: '16px',
  marginLeft: '4px',
  color: '#666',
  display: 'none',
});

export const functionCard = css({
  boxSizing: 'border-box',
  width: '100%',
  background: '#CDD1D5',
  border: '2px solid #DEE2E6',
  borderRadius: '20px',
  marginBottom: '20px',
  overflow: 'hidden',
});

export const functionTypeLabel = css(baseLabel, {
  width: '88px',
  height: '20px',
});

export const functionName = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '22px',
  lineHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.02em',
  color: '#2D2D2D',
  marginBottom: '10px',
});

export const functionDescription = css({
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '120%',
  color: '#4A4A4A',
  marginBottom: '20px',
});

export const parametersLabel = css(baseLabel, {
  width: '123px',
  height: '20px',
});

export const parameterInput = css({
  background: '#FFFFFF',
  border: '2px solid #DEE2E6',
  borderRadius: '8px',
  height: '48px',
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  marginRight: '16px',
  marginBottom: '16px',
  fontFamily: 'Inter, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '19px',
  color: '#3F444A',
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '& .MuiInputBase-root': {
    '&.Mui-focused fieldset': {
      border: 'none',
    }
  }
});

export const actionButtonsContainer = css({
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  marginTop: '15px',
});

export const simulateButton = css(baseButton);
export const sendButton = css(baseButton);
export const authwitButton = css(baseButton);

export const loadingArtifactContainer = css({
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'center',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2rem',
  height: '100%',
});

export const headerContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  marginBottom: '25px',
});

export const functionListContainer = css({
  width: '100%',
  padding: '0',
});
