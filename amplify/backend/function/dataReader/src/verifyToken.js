const admin = require('firebase-admin');

let firebaseInitialized = false;

function initializeFirebase() {
  if (!firebaseInitialized) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-engineering-jira-tracking';

    admin.initializeApp({
      projectId: projectId
    });

    firebaseInitialized = true;
    console.log('Firebase Admin initialized with project:', projectId);
  }
}

function extractToken(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

async function verifyFirebaseToken(authHeader) {
  try {
    const token = extractToken(authHeader);
    if (!token) {
      return {
        valid: false,
        error: 'Missing or invalid Authorization header. Expected: Bearer <token>'
      };
    }

    initializeFirebase();

    const decodedToken = await admin.auth().verifyIdToken(token);

    if (!decodedToken.email) {
      return {
        valid: false,
        error: 'Token does not contain email claim'
      };
    }

    if (!decodedToken.email.endsWith('@redhat.com')) {
      return {
        valid: false,
        error: 'Access denied. Only @redhat.com email addresses are allowed.'
      };
    }

    return {
      valid: true,
      email: decodedToken.email,
      uid: decodedToken.uid
    };

  } catch (error) {
    console.error('Token verification error:', error);

    if (error.code === 'auth/id-token-expired') {
      return {
        valid: false,
        error: 'Token has expired. Please sign in again.'
      };
    }

    if (error.code === 'auth/argument-error') {
      return {
        valid: false,
        error: 'Invalid token format'
      };
    }

    return {
      valid: false,
      error: `Token verification failed: ${error.message}`
    };
  }
}

module.exports = {
  verifyFirebaseToken,
  extractToken
};
