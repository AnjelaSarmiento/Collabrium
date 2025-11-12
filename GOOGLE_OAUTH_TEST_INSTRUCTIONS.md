# Google OAuth Testing Instructions

Follow these steps to test the Google Sign-In integration:

## Quick Setup for Testing

1. **Set up Google OAuth credentials** (see GOOGLE_OAUTH_SETUP.md for detailed instructions)

2. **Configure environment variables**:
   - Backend: Update `config.env` with your Google Client ID and Secret
   - Frontend: Create `client/.env` with your Google Client ID

3. **Start the application**:
   ```bash
   # Terminal 1: Start backend
   npm run dev
   
   # Terminal 2: Start frontend
   cd client
   npm start
   ```

## Test Scenarios

### 1. New User Registration via Google

1. Navigate to `http://localhost:3000/login`
2. Click "Sign in with Google"
3. Select a Google account that hasn't been used with the app before
4. Grant permissions
5. **Expected**: User should be created automatically and redirected to `/app`
6. **Verify**: Check MongoDB for the new user document with `googleId` and `provider: 'google'`

### 2. Existing Google User Login

1. Use the same Google account from Test 1
2. Click "Sign in with Google"
3. **Expected**: User should be logged in immediately
4. **Verify**: User data should be populated in the app

### 3. Link Google Account to Existing Email User

1. Create a regular account using email/password
2. Logout
3. Try to sign in with Google using the same email address
4. **Expected**: The Google account should be linked to the existing user
5. **Verify**: User document should now have both password and googleId fields

### 4. Error Handling

1. Test with invalid Google Client ID (modify environment variable)
2. **Expected**: Should show appropriate error message
3. Test network disconnection during OAuth flow
4. **Expected**: Should handle gracefully with error message

## What to Check

### Frontend Behavior
- [ ] Google Sign-In button appears on login page
- [ ] Button is properly styled and matches app theme
- [ ] Button is disabled during loading states
- [ ] Error messages are displayed appropriately
- [ ] User is redirected to `/app` after successful authentication
- [ ] Loading states are handled properly

### Backend Behavior
- [ ] Google OAuth routes respond correctly
- [ ] User creation works for new Google users
- [ ] Account linking works for existing email users
- [ ] JWT tokens are generated and set correctly
- [ ] Wallet is created for new users
- [ ] User sessions are managed properly

### Database
- [ ] New users have correct schema (googleId, provider, etc.)
- [ ] Profile pictures are set from Google profile
- [ ] Email verification is set to true for Google users
- [ ] Wallets are created with starting balance

## Common Issues and Solutions

### Google Button Doesn't Appear
- Check browser console for JavaScript errors
- Verify Google Identity Services script is loading
- Confirm REACT_APP_GOOGLE_CLIENT_ID is set

### "Error 400: invalid_request"
- Check Google Cloud Console OAuth configuration
- Verify authorized origins include `http://localhost:3000`
- Ensure redirect URIs include `http://localhost:5000/api/auth/google/callback`

### Backend Authentication Errors
- Check server console logs
- Verify Google Client ID and Secret in config.env
- Ensure google-auth-library package is installed
- Check MongoDB connection

### Token Verification Fails
- Verify Client ID matches between frontend and backend
- Check that Google APIs are enabled in Cloud Console
- Ensure proper network connectivity

## Success Criteria

✅ **Integration is successful if**:
1. New users can sign up using Google
2. Existing Google users can sign in
3. Email accounts can be linked with Google
4. User data is properly saved to database
5. Authentication flow works end-to-end
6. Error cases are handled gracefully
7. UI/UX follows modern design patterns

## Manual Testing Checklist

- [ ] Test with multiple Google accounts
- [ ] Test account linking scenario
- [ ] Test error handling (network issues, invalid credentials)
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Verify mobile responsiveness of Google button
- [ ] Check that existing email/password login still works
- [ ] Verify user profile data is correctly populated
- [ ] Test logout functionality for Google-authenticated users

## Automated Testing (Future Enhancement)

Consider adding these automated tests:
- Unit tests for GoogleSignInButton component
- Integration tests for Google OAuth backend routes
- E2E tests for the complete authentication flow
- Mock tests for Google Identity Services API
