const AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "An account already exists with this email. Sign in with your email and password instead.",
  OAuthSignin: "Could not start sign-in. Please try again.",
  OAuthCallback: "Sign-in was interrupted. Please try again.",
  OAuthCreateAccount: "Could not create an account with that provider. Please try again.",
  EmailCreateAccount: "Could not create an account with that email. Please try again.",
  CallbackRouteError: "Something went wrong during sign-in. Please try again.",
  AccessDenied: "Access was denied. You may not have permission to sign in.",
  Configuration: "Sign-in is not configured correctly. Please try again later.",
  CredentialsSignin: "Email or password is incorrect.",
  Default: "Sign-in failed. Please try again.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.Default;
}
