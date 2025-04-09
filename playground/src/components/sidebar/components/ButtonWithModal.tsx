import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { css, keyframes } from '@emotion/react';
import CircularProgress from '@mui/material/CircularProgress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

// Animation for the modal appearing
const popupAnimation = keyframes`
  from {
    opacity: 0;
    max-height: 0;
    transform: scaleY(0);
    transform-origin: top;
    margin-bottom: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
    transform: scaleY(1);
    transform-origin: top;
    margin-bottom: 15px;
  }
`;

// Styles for the container
const containerStyle = css({
  position: 'relative',
  width: '100%',
  marginBottom: '15px',
  transition: 'transform 0.3s ease',
});

// Styles for the button
const buttonStyle = css({
  height: '56px',
  borderRadius: '12px',
  backgroundColor: '#CDD1D5',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 24px',
  fontFamily: "'Inter', sans-serif",
  fontWeight: 600,
  fontSize: '17px',
  lineHeight: '16px',
  color: '#000000',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#BCC0C4',
  },
  '@media (max-width: 400px)': {
    width: '100%',
  },
});

// Styles for active button
const activeButtonStyle = css({
  background: '#9894FF',
  color: '#FFFFFF',
  '&:hover': {
    backgroundColor: '#8985FF',
  },
});

// Styles for the dropdown icon
const dropdownIconStyle = css({
  fontSize: '20px',
  marginLeft: '8px',
  transition: 'transform 0.3s ease',
});

// Styles for the modal content wrapper
const modalStyle = css({
  position: 'relative',
  left: '0',
  right: '0',
  marginTop: '5px',
  backgroundColor: '#F5F5F5',
  borderRadius: '10px',
  padding: '15px',
  boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
  zIndex: 10,
  animation: `${popupAnimation} 0.3s ease-out forwards`,
  overflow: 'hidden',
  transformOrigin: 'top',
});

// Styles for loading spinner
const loadingSpinner = css({
  marginLeft: '8px',
  color: '#FFFFFF',
});

interface ButtonWithModalProps {
  label: string;
  isActive: boolean;
  isSelected?: boolean;
  isLoading?: boolean;
  connectionStatus?: string;
  onClick: () => void;
  children?: ReactNode;
}

export function ButtonWithModal({
  label,
  isActive,
  isSelected = false,
  isLoading = false,
  connectionStatus,
  onClick,
  children,
}: ButtonWithModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const handleButtonClick = () => {
    onClick();
  };

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div css={containerStyle}>
      {/* Button */}
      <div css={[buttonStyle, isActive && activeButtonStyle]} onClick={handleButtonClick}>
        <span>{isSelected && connectionStatus ? connectionStatus : label}</span>
        {isLoading ? (
          <CircularProgress size={20} css={loadingSpinner} />
        ) : (
          <KeyboardArrowDownIcon css={[dropdownIconStyle, isActive && { transform: 'rotate(180deg)' }]} />
        )}
      </div>

      {/* Modal - show whenever isActive is true */}
      {isActive && (
        <div ref={modalRef} css={modalStyle} onClick={handleModalClick}>
          {children}
        </div>
      )}
    </div>
  );
}
