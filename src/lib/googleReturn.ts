const CREDENTIAL_KEY = "vms-google-credential";
const ERROR_KEY = "vms-google-error";
const NONCE_KEY = "vms-google-nonce";

/** Saves a Google redirect result and removes it from the address bar. */
export function captureGoogleReturn() {
  if (!window.location.hash || window.location.hash.length < 2) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const idToken = params.get("id_token");
  const error = params.get("error");
  if (!idToken && !error) return;
  if (idToken) sessionStorage.setItem(CREDENTIAL_KEY, idToken);
  if (error) sessionStorage.setItem(ERROR_KEY, error);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

export function rememberGoogleNonce(nonce: string) {
  sessionStorage.setItem(NONCE_KEY, nonce);
}

export function takeGoogleResult(): { credential?: string; error?: string } {
  const error = sessionStorage.getItem(ERROR_KEY);
  const credential = sessionStorage.getItem(CREDENTIAL_KEY);
  const expected = sessionStorage.getItem(NONCE_KEY);
  sessionStorage.removeItem(ERROR_KEY);
  sessionStorage.removeItem(CREDENTIAL_KEY);
  sessionStorage.removeItem(NONCE_KEY);
  if (!error && !credential) return {};
  if (error) return { error: googleErrorMessage(error) };
  if (!credential || !expected || tokenNonce(credential) !== expected) {
    return { error: "Google sign-in could not be verified. Try again." };
  }
  return { credential };
}

function tokenNonce(idToken: string): string | null {
  const segment = idToken.split(".")[1];
  if (!segment) return null;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { nonce?: unknown };
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

function googleErrorMessage(code: string): string {
  if (code === "access_denied") return "Google sign-in was cancelled.";
  if (code === "redirect_uri_mismatch") return "Google sign-in is not allowed for this address. Open the admin at http://localhost:5173.";
  return "Google sign-in could not be completed. Try again.";
}
