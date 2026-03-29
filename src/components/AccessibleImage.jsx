import React from 'react';
import PropTypes from 'prop-types';

/**
 * Accessible Image Component
 * Ensures all images have proper alt text and loading states
 */
const AccessibleImage = ({
  src,
  alt,
  width,
  height,
  className = '',
  lazy = true,
  fallbackSrc,
  ...props
}) => {
  const [hasError, setHasError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  const imageSrc = hasError && fallbackSrc ? fallbackSrc : src;
  const imageAlt = alt || '';

  if (!imageAlt) {
    console.warn('AccessibleImage: Missing alt text for image:', src);
  }

  return (
    <div className={`image-container ${className}`} style={{ width, height }}>
      {isLoading && (
        <div 
          className="image-skeleton" 
          aria-hidden="true"
          style={{ width, height }}
        />
      )}
      <img
        src={imageSrc}
        alt={imageAlt}
        width={width}
        height={height}
        loading={lazy ? 'lazy' : 'eager'}
        onError={handleError}
        onLoad={handleLoad}
        className={`image ${isLoading ? 'image--loading' : ''} ${hasError ? 'image--error' : ''}`}
        aria-hidden={!imageAlt}
        {...props}
      />
      {hasError && fallbackSrc && (
        <span className="visually-hidden">
          Original image failed to load, showing fallback
        </span>
      )}
    </div>
  );
};

AccessibleImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string,
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
  lazy: PropTypes.bool,
  fallbackSrc: PropTypes.string,
};

export default AccessibleImage;
