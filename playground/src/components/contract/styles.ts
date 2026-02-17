import { css } from '@mui/styled-engine';
import { colors, commonStyles } from '../../global.styles';

// Base styles
const baseButton = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px 20px',
  gap: '9px',
  height: '38px',
  background: colors.primary.main,
  borderRadius: commonStyles.borderRadius,
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '19px',
  color: colors.primary.contrastText,
  border: 'none',
  cursor: 'pointer',
  transition: 'box-shadow 0.2s ease',
  '&:hover': {
    boxShadow: `0px 4px 12px ${commonStyles.borderVeryStrong.replace('1px solid ', '')}`,
  },
  '&:disabled': {
    backgroundColor: `${colors.primary.main}4D`, // 30% opacity
    color: `${colors.primary.contrastText}80`, // 50% opacity
    cursor: 'not-allowed',
  },
});

const baseLabel = css({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '6px 16px',
  gap: '10px',
  background: colors.secondary.main,
  borderRadius: commonStyles.borderRadius,
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '12px',
  lineHeight: '120%',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: colors.text.primary,
  marginBottom: '10px',
});

// Layout styles
export const container = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: colors.background.paper,
  backdropFilter: commonStyles.backdropBlur,
  border: commonStyles.borderLight,
  borderRadius: commonStyles.borderRadius,
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
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '18px',
  lineHeight: '120%',
  display: 'flex',
  alignItems: 'center',
  textAlign: 'center',
  color: colors.text.primary,
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
  background: colors.secondary.main,
  borderRadius: commonStyles.borderRadius,
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: colors.text.primary,
  transition: 'background-color 0.2s ease',
  '&:hover': {
    backgroundColor: colors.secondary.light,
  },
});

export const dropZoneContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '80%',
  border: commonStyles.borderDashed,
  borderRadius: commonStyles.borderRadius,
  margin: '2rem 0',
  backgroundColor: `${colors.primary.main}0A`, // ~4% opacity
  alignItems: 'center',
  justifyContent: 'center',
});

export const uploadIcon = css({
  fontSize: '64px',
  color: colors.primary.main,
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
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 700,
  fontSize: '48px',
  lineHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.02em',
  color: colors.text.primary,
  marginBottom: '25px',
});

export const searchContainer = css({
  width: '361px',
  height: '36px',
  background: commonStyles.glassDark,
  border: commonStyles.borderMedium,
  borderRadius: commonStyles.borderRadius,
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
  background: `${colors.secondary.main}80`, // 50% opacity
  border: commonStyles.borderMedium,
  borderRadius: commonStyles.borderRadius,
  cursor: 'pointer',
  position: 'relative',
  transition: 'background-color 0.2s ease',
  '&:hover': {
    backgroundColor: `${colors.secondary.main}B3`, // 70% opacity
  },
});

export const filterCheckbox = css({
  width: '24px',
  height: '24px',
  background: commonStyles.glassDark,
  border: commonStyles.borderStrong,
  borderRadius: commonStyles.borderRadius,
  marginLeft: '5px',
});

export const filterLabel = css({
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '16px',
  lineHeight: '19px',
  textAlign: 'center',
  color: colors.text.primary,
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
  background: commonStyles.glassDark,
  border: commonStyles.borderMedium,
  borderRadius: commonStyles.borderRadius,
  marginBottom: '20px',
  overflow: 'hidden',
});

export const functionTypeLabel = css(baseLabel, {
  width: '88px',
  height: '20px',
});

export const functionName = css({
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '22px',
  lineHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.02em',
  color: colors.primary.main,
  marginBottom: '10px',
});

export const functionDescription = css({
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 400,
  fontSize: '14px',
  lineHeight: '120%',
  color: colors.text.primary,
  opacity: 0.8,
  marginBottom: '20px',
});

export const parametersLabel = css(baseLabel, {
  width: '123px',
  height: '20px',
});

export const parameterInput = css({
  background: commonStyles.glassDark,
  border: commonStyles.borderMedium,
  borderRadius: commonStyles.borderRadius,
  height: '48px',
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  marginRight: '16px',
  marginBottom: '16px',
  fontFamily: 'Geist, sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '19px',
  color: colors.text.primary,
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '& .MuiInputBase-root': {
    color: colors.text.primary,
    '&.Mui-focused fieldset': {
      border: 'none',
    },
  },
  '& .MuiInputBase-input': {
    color: colors.text.primary,
  },
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
