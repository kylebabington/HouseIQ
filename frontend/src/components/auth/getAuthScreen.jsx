// frontend/src/components/auth/getAuthScreen.jsx

import {
  AuthErrorScreen,
  AuthLoadingScreen,
  LoggedOutFlow,
} from "./AuthScreens.jsx";

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
        loginWithRedirect={loginWithRedirect}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LoggedOutFlow loginWithRedirect={loginWithRedirect} />
    );
  }

  return null;
}

export default getAuthScreen;
