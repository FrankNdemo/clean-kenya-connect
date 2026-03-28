import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Recycle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { createComplaintApi } from '@/api';
import { AuthError, useAuth } from '@/hooks/useAuth';
import { isStandaloneAppMode } from '@/lib/appMode';
import { getDashboardPathForUser } from '@/lib/dashboardPaths';
import { toast } from 'sonner';

const LOGIN_FORM_CLEAR_KEY = 'mtaka_clear_login_form';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [manualEntryEnabled, setManualEntryEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [suspensionReason, setSuspensionReason] = useState('');
  const [suspendedUser, setSuspendedUser] = useState<{ id: number; email: string; phone?: string; name?: string } | null>(null);
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isStandaloneApp = isStandaloneAppMode();
  const formRef = useRef<HTMLFormElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const clearLoginForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setManualEntryEnabled(false);
    formRef.current?.reset();
    if (emailInputRef.current) emailInputRef.current.value = '';
    if (passwordInputRef.current) passwordInputRef.current.value = '';
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(LOGIN_FORM_CLEAR_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    const clearSoon = () => {
      clearLoginForm();
    };

    clearSoon();
    const frameId = window.requestAnimationFrame(clearSoon);
    const timeoutA = window.setTimeout(clearSoon, 75);
    const timeoutB = window.setTimeout(clearSoon, 250);
    const handlePageShow = () => {
      clearSoon();
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutA);
      window.clearTimeout(timeoutB);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [clearLoginForm]);

  const handleScrollToForm = useCallback(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        toast.success(`Welcome back, ${user.name || user.email}`);
        const fromPath =
          typeof location.state === 'object' &&
          location.state &&
          'from' in location.state &&
          typeof (location.state as { from?: { pathname?: string; search?: string; hash?: string } }).from?.pathname === 'string'
            ? `${(location.state as { from: { pathname: string; search?: string; hash?: string } }).from.pathname}${(location.state as { from: { search?: string } }).from.search || ''}${(location.state as { from: { hash?: string } }).from.hash || ''}`
            : '';
        if (fromPath && fromPath !== '/login') {
          navigate(fromPath, { replace: true });
          return;
        }
        navigate(getDashboardPathForUser(user), { replace: true });
      } else {
        toast.error('Invalid email or password.');
      }
    } catch (error: unknown) {
      const authError = error as AuthError;
      const message = authError instanceof Error ? authError.message : 'Login failed';
      if (authError?.payload?.suspended) {
        setSuspensionReason(authError.payload.suspension_reason || '');
        setSuspendedUser(authError.payload.suspended_user || null);
        setComplaintText('');
        setComplaintOpen(true);
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitSuspensionComplaint = async () => {
    if (!complaintText.trim()) {
      toast.error('Please provide complaint details');
      return;
    }

    try {
      setIsSubmittingComplaint(true);
      await createComplaintApi({
        reporter: suspendedUser?.id,
        subject: 'Suspended account complaint',
        details: complaintText.trim(),
        phone: suspendedUser?.phone || '',
      });
      toast.success('Complaint submitted successfully. Authority will review and contact you.');
      setComplaintOpen(false);
      setComplaintText('');
    } catch {
      toast.error('Failed to submit complaint. Please try again.');
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  return (
    <>
      <div className="relative min-h-[100dvh] overflow-hidden bg-white">
        <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-5 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8">
          {!isStandaloneApp && (
            <Link
              to="/"
              className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          )}

          <div className="grid flex-1 gap-0 overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)] lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
            <section className="relative min-h-[20rem] overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 p-6 text-white sm:p-8 lg:min-h-[calc(100dvh-8rem)] lg:p-10">
              <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
              <div className="absolute -left-6 bottom-0 h-[28rem] w-[28rem] rounded-full bg-emerald-900/30" />
              <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-white/10" />
              <div className="absolute bottom-8 right-8 h-20 w-20 rounded-full bg-emerald-950/20 blur-2xl" />

              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-emerald-700 shadow-lg">
                    <Recycle className="h-6 w-6" />
                  </div>
                  <div className="pt-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.35em] text-white/85">M-Taka</p>
                  </div>
                </div>

                <div className="max-w-md space-y-4">
                  <div className="space-y-2">
                    <p className="text-4xl font-semibold leading-tight sm:text-5xl">Welcome Back!</p>
                    <p className="text-sm leading-6 text-white/75 sm:text-base">
                      To stay connected with us, please log in with your personal info
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleScrollToForm}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/35 px-8 text-xs font-semibold uppercase tracking-[0.3em] text-white transition-colors hover:bg-white/10"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </section>

            <section className="flex items-center justify-center bg-white px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
              <Card className="w-full max-w-sm border-0 bg-transparent shadow-none">
                <CardHeader className="space-y-2 p-0 text-center">
                  <CardTitle className="text-3xl font-semibold capitalize text-emerald-700">welcome</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">
                    Login to your account to continue
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-0 pt-8">
                  <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                    <div className="sr-only" aria-hidden="true">
                      <input type="text" name="mtaka_fake_username" autoComplete="username" tabIndex={-1} />
                      <input type="password" name="mtaka_fake_password" autoComplete="current-password" tabIndex={-1} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Email
                      </Label>
                      <div className="relative">
                        <Input
                          ref={emailInputRef}
                          id="email"
                          name="mtaka_login_email"
                          type="email"
                          placeholder="Email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onFocus={() => setManualEntryEnabled(true)}
                          className="h-10 rounded-full border-0 bg-emerald-100/85 px-4 text-sm shadow-none placeholder:text-emerald-500/70 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          readOnly={!manualEntryEnabled}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          ref={passwordInputRef}
                          id="password"
                          name="mtaka_login_password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onFocus={() => setManualEntryEnabled(true)}
                          className="h-10 rounded-full border-0 bg-emerald-100/85 px-4 pr-10 text-sm shadow-none placeholder:text-emerald-500/70 focus-visible:ring-2 focus-visible:ring-emerald-500/20"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          readOnly={!manualEntryEnabled}
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-emerald-700/70 transition-colors hover:text-emerald-800"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="text-right">
                        <Link to="/forgot-password" className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
                          Forgot your password?
                        </Link>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      size="default"
                      className="h-10 w-full rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Signing in...' : 'Login'}
                    </Button>
                  </form>

                  <p className="mt-6 text-center text-xs text-slate-500">
                    Don&apos;t have an account?{' '}
                    <Link to="/register" className="font-semibold text-emerald-700 hover:underline">
                      Sign up
                    </Link>
                  </p>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>

      <Dialog open={complaintOpen} onOpenChange={setComplaintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account Suspended</DialogTitle>
            <DialogDescription>
              Your account is suspended. You can submit a complaint for review by county authority.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <p><strong>Account:</strong> {suspendedUser?.email || email}</p>
              {suspensionReason ? <p><strong>Reason:</strong> {suspensionReason}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="complaint">Complaint Details</Label>
              <Textarea
                id="complaint"
                rows={4}
                placeholder="Explain why you believe the suspension should be reviewed..."
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplaintOpen(false)} disabled={isSubmittingComplaint}>
              Cancel
            </Button>
            <Button onClick={handleSubmitSuspensionComplaint} disabled={isSubmittingComplaint || !complaintText.trim()}>
              {isSubmittingComplaint ? 'Submitting...' : 'Submit Complaint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
