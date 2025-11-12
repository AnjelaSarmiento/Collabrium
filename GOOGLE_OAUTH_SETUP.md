# Google OAuth Setup Guide

This guide explains how to set up Google Sign-In for the Collabrium application.

## Prerequisites

You need to have a Google account and access to the Google Cloud Console.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note down your project ID

## Step 2: Enable Google+ API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google+ API" and enable it
3. Also enable "Google Identity and Access Management (IAM) API"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Web application" as the application type
4. Set the following:
   - **Name**: Collabrium Web Client
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000` (for development)
     - Add your production domain when deploying
   - **Authorized redirect URIs**:
     - `http://localhost:5000/api/auth/google/callback` (for development)
     - Add your production API domain when deploying

5. Click "Create" and note down:
   - **Client ID**
   - **Client Secret**

## Step 4: Configure Environment Variables

### Backend Configuration (config.env)

Replace the placeholder values in `config.env`:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_actual_google_client_id_here
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Session Secret (generate a secure random string)
SESSION_SECRET=your_secure_session_secret_key_here
```

### Frontend Configuration

1. Create a `.env` file in the `client` directory:
2. Copy the contents from `client/env.example`
3. Replace the placeholder values:

```env
# React App Environment Variables
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_GOOGLE_CLIENT_ID=your_actual_google_client_id_here
```

**Note**: Use the same Google Client ID for both backend and frontend.

## Step 5: Verify Setup

1. Start the backend server: `npm run dev`
2. Start the frontend: `cd client && npm start`
3. Navigate to `http://localhost:3000/login`
4. You should see the "Sign in with Google" button

## Testing the Integration

1. Click the "Sign in with Google" button
2. Choose a Google account to sign in with
3. Grant permissions to the application
4. You should be redirected to the app dashboard

## Troubleshooting

### Common Issues:

1. **"Error 400: invalid_request"**
   - Check that your JavaScript origins and redirect URIs are correctly configured
   - Ensure the Client ID matches in both backend and frontend

2. **"Error 401: invalid_client"**
   - Verify that your Client ID and Client Secret are correct
   - Check that the Google+ API is enabled

3. **Google button doesn't appear**
   - Check browser console for JavaScript errors
   - Verify that the Google Identity Services script is loading
   - Ensure REACT_APP_GOOGLE_CLIENT_ID is set correctly

4. **Backend authentication fails**
   - Check server logs for detailed error messages
   - Verify that google-auth-library is installed
   - Ensure MongoDB is running and accessible

### Development vs Production

When deploying to production:
1. Update the authorized origins and redirect URIs in Google Cloud Console
2. Update the environment variables with production URLs
3. Ensure HTTPS is used in production (required by Google OAuth)

## Security Notes

- Keep your Client Secret secure and never expose it in frontend code
- Use environment variables for all sensitive configuration
- Regularly rotate your session secrets
- Consider implementing additional security measures like CSRF protection

## Additional Resources

- [Google Identity Platform Documentation](https://developers.google.com/identity)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Passport.js Google OAuth Strategy](http://www.passportjs.org/packages/passport-google-oauth20/)
