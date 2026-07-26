// frontend/src/components/auth/getAuthScreen.jsx

import {
  AuthErrorScreen,
  AuthLoadingScreen,
  LoginScreen,
} from "./AuthScreens.jsx";


// ---------------------------------------------------------
// CHOOSE WHICH AUTHENTICATION SCREEN TO DISPLAY
// ---------------------------------------------------------
//
// Returns null once the user is signed in, which tells the
// caller to keep rendering the normal application shell.
//
function getAuthScreen({
  isAuthLoading,
  authError,
  isAuthenticated,
  loginWithRedirect,
}) {
  if (isAuthLoading) {
    return <AuthLoadingScreen />;
  }

  if (authError) {
    return (
      <AuthErrorScreen
        authError={authError}
        loginWithRedirect={
          loginWithRedirect
        }
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        loginWithRedirect={
          loginWithRedirect
        }
      />
    );
  }

  return null;
}


export default getAuthScreen;
