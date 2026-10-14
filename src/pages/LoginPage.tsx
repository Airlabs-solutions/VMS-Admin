import { FormEvent, useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Field, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { rememberGoogleNonce, takeGoogleResult } from "../lib/googleReturn";

type Step = "choose" | "code";
type SuperConfig = { email: string; googleClientId: string | null };

export function LoginPage() {
  const navigate = useNavigate();
  const onGoogle = useRef<(credential: string) => void>(() => {});
  const [config, setConfig] = useState<SuperConfig | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [action, setAction] = useState<"otp" | "google">("otp");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ data: SuperConfig }>("/auth/super-admin/config")
      .then((result) => setConfig(result.data))
      .catch(() => setConfig({ email: "", googleClientId: null }));
  }, []);

  async function sendCode() {
    setAction("otp");
    setPending(true);
    setError("");
    setNotice("");
    setDevCode("");
    try {
      const result = await api<{ data: { message: string; devCode?: string } }>("/auth/super-admin/google", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
      });
      setNotice(result.data.message);
      setDevCode(result.data.devCode ?? "");
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle(credential: string) {
    setAction("google");
    setPending(true);
    setError("");
    try {
      await api("/auth/super-admin/google", { method: "POST", body: { credential } });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
      setPending(false);
    }
  }

  onGoogle.current = (credential) => {
    void signInWithGoogle(credential);
  };

  useEffect(() => {
    const result = takeGoogleResult();
    if (result.error) setError(result.error);
    if (result.credential) onGoogle.current(result.credential);
  }, []);

  function startGoogle() {
    const clientId = config?.googleClientId;
    if (!clientId) {
      setError("Google sign-in is not available right now.");
      return;
    }
    const nonce = crypto.randomUUID().replace(/-/g, "");
    rememberGoogleNonce(nonce);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: window.location.origin,
      response_type: "id_token",
      response_mode: "fragment",
      scope: "openid email profile",
      nonce,
      prompt: "select_account",
    });
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  async function onSendOtp(event: FormEvent) {
    event.preventDefault();
    await sendCode();
  }

  async function onCodeSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/auth/super-admin/verify", { method: "POST", body: { code: code.trim(), email: email.trim().toLowerCase() } });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-8 sm:px-5">
      <section className="relative w-full max-w-[460px] rounded-lg border border-line bg-card px-6 py-6 shadow-[0_1px_2px_rgba(28,36,52,0.05),0_8px_24px_rgba(28,36,52,0.05)] sm:px-9 sm:py-9">
        <p className="text-[13px] font-medium tracking-[0.08em] text-brand-deep uppercase">Vehicle Management System</p>
        <h1 className="mt-4 text-[30px] leading-none font-bold tracking-tight text-ink sm:text-[32px]">Sign in</h1>
        <p className="mt-3 text-[15px] leading-6 text-muted">Use your email or continue with Google</p>

        {step === "choose" ? (
          <form onSubmit={onSendOtp} className="mt-8">
            {config === null ? (
              <div className="h-[50px] w-full animate-pulse rounded-md bg-line" />
            ) : (
              <button
                type="button"
                className="inline-flex h-[50px] w-full items-center justify-center gap-3 rounded-md border border-line bg-card text-[15px] font-medium text-ink transition duration-200 ease-out hover:border-brand-mid disabled:cursor-not-allowed disabled:opacity-60"
                onClick={startGoogle}
                disabled={pending}
              >
                <GoogleMark />
                Continue with Google
              </button>
            )}
            {pending && action === "google" ? <p className="mt-2 text-[13px] text-muted">Checking your Google account...</p> : null}

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[13px] text-muted">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <label className="block text-[14px] font-medium text-ink" htmlFor="email">Email Address</label>
            <span className="relative mt-2 block">
              <Mail className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                required
                className="h-[50px] w-full rounded-md border border-line bg-card pr-3 pl-10 text-[15px] text-ink transition-colors duration-150 outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </span>

            {error ? <p className="mt-3 text-[13px] leading-5 text-status-danger" role="alert">{error}</p> : null}

            <button
              className="mt-4 inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-md bg-brand text-[15px] font-semibold text-ink transition-colors duration-200 ease-out hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:bg-brand-mid disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
            >
              {pending && action === "otp" ? <Spinner /> : null}
              {pending && action === "otp" ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={onCodeSubmit} className="mt-8">
            <p className="text-[15px] font-medium leading-6 text-ink">{notice || "A sign-in code was sent to the Super Admin Gmail."}</p>
            <p className="mt-2 text-[15px] leading-6 text-muted">Enter the OTP sent to the Super Admin Gmail to complete verification.</p>
            {devCode ? (
              <p className="mt-3 rounded-[8px] border border-status-warn bg-status-warn-bg px-3 py-3 text-[13px] leading-5 text-status-warn">
                Development code: {devCode}. It is shown here because Gmail sending is not configured.
              </p>
            ) : null}
            <div className="mt-4">
              <Field label="Gmail Code">
                <TextInput
                  className="h-[50px] rounded-md text-[16px] tracking-[0.18em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </Field>
            </div>
            {error ? <p className="mt-3 text-[13px] leading-5 text-status-danger" role="alert">{error}</p> : null}
            <button
              className="mt-4 inline-flex h-[50px] w-full items-center justify-center rounded-md bg-brand text-[15px] font-semibold text-ink transition-colors duration-200 ease-out hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:bg-brand-mid disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending || code.length !== 6}
            >
              {pending ? "Checking code..." : "Verify & Sign In"}
            </button>
            <button
              type="button"
              className="mt-3 text-[14px] font-medium text-brand-deep transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => {
                setStep("choose");
                setCode("");
                setDevCode("");
                setNotice("");
                setError("");
              }}
            >
              Back
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />;
}
