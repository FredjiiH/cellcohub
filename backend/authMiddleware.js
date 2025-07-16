const { ConfidentialClientApplication } = require('@azure/msal-node');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// MSAL configuration for backend
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`
  }
};

const msalInstance = new ConfidentialClientApplication(msalConfig);

// JWKS client for token validation
const jwksClientInstance = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}/discovery/v2.0/keys`,
  timeout: 30000
});

// Middleware to validate Azure AD tokens
const validateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // For now, we'll do basic validation since we're using the user info from headers
    // In production, you should validate the JWT token properly with Azure AD
    if (token && token.length > 0) {
      // Extract user info from headers (sent by frontend)
      req.user = {
        email: req.headers['x-user-email'] || 'unknown@cellcolabs.com',
        name: req.headers['x-user-name'] || 'Unknown User'
      };
      next();
    } else {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(401).json({ error: 'Token validation failed' });
  }
};

// Check if user has @cellcolabs.com domain
const checkDomain = (req, res, next) => {
  const userEmail = req.user?.email || '';
  
  if (!userEmail.toLowerCase().endsWith('@cellcolabs.com')) {
    return res.status(403).json({ 
      error: 'Access denied. Only @cellcolabs.com accounts are allowed.' 
    });
  }
  
  next();
};

module.exports = {
  validateToken,
  checkDomain
}; 