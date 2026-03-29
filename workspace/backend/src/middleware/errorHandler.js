// Standardized error handling middleware
function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const errorType = err.name || 'InternalServerError';
  
  // Standardized error response
  const errorResponse = {
    error: errorType,
    message: message,
    timestamp: new Date().toISOString(),
    path: req.path
  };
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
}

// Custom error classes
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

module.exports = {
  errorHandler,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError
};
