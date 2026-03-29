import React from 'react';
import PropTypes from 'prop-types';
import './Button.css';

/**
 * Accessible Button Component
 * 
 * Features:
 * - Proper ARIA support
 * - Keyboard navigation
 * - Focus management
 * - Loading states
 */
const Button = ({
  children,
  onClick,
  type = 'button',
  disabled = false,
  loading = false,
  ariaLabel,
  className = '',
  variant = 'primary',
  ...props
}) => {
  const handleKeyDown = (e) => {
    // Handle space and enter keys for accessibility
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!disabled && !loading && onClick) {
        onClick(e);
      }
    }
  };

  const buttonClasses = [
    'button',
    `button--${variant}`,
    disabled ? 'button--disabled' : '',
    loading ? 'button--loading' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={disabled || loading ? undefined : onClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="button__loader" aria-hidden="true" />
          <span className="visually-hidden">Loading...</span>
        </>
      ) : children}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  ariaLabel: PropTypes.string,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'success']),
};

export default Button;
