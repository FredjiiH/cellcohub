import { Configuration, PopupRequest } from "@azure/msal-browser";

// MSAL configuration
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID || "", // You'll get this from Azure AD
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID || 'common'}`, // Use your specific tenant ID
    redirectUri: window.location.origin, // Redirect back to your app
  },
  cache: {
    cacheLocation: "sessionStorage", // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
  }
};

// Add scopes here for ID token to be used at MS Identity Platform.
export const loginRequest: PopupRequest = {
  scopes: ["User.Read", "email", "profile"]
};

// Add the endpoints here for Microsoft Graph API services you'd like to use.
export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me"
};

// Domain restriction for cellcolabs.com
export const ALLOWED_DOMAIN = "cellcolabs.com";

// Check if user's email domain is allowed
export const isAllowedDomain = (email: string): boolean => {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}; 