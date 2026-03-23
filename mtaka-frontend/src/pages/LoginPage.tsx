import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Recycle, ArrowLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { createComplaintApi } from '@/api';
import { AuthError, useAuth } from '@/hooks/useAuth';
import { isStandaloneAppMode } from '@/lib/appMode';
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
        switch (user.role) {
          case 'resident': navigate('/dashboard/resident'); break;
          case 'collector': navigate('/dashboard/collector'); break;
          case 'recycler': navigate('/dashboard/recycler'); break;
          case 'authority': navigate('/dashboard/authority'); break;
          default: navigate('/');
        }
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
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-md">
          {!isStandaloneApp && (
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          )}

          <Card className="shadow-lg">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
                <Recycle className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription>Sign in to your M-Taka account</CardDescription>
            </CardHeader>
            <CardContent>
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                <div className="sr-only" aria-hidden="true">
                  <input type="text" name="mtaka_fake_username" autoComplete="username" tabIndex={-1} />
                  <input type="password" name="mtaka_fake_password" autoComplete="current-password" tabIndex={-1} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={emailInputRef}
                      id="email"
                      name="mtaka_login_email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setManualEntryEnabled(true)}
                      className="pl-10"
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={passwordInputRef}
                      id="password"
                      name="mtaka_login_password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setManualEntryEnabled(true)}
                      className="pl-10 pr-10"
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
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? 'Signing in...' : 'Sign In'}</Button>
              </form>

              <p className="text-sm text-center text-muted-foreground mt-6">
                Don't have an account?{' '}
                <Link to="/register" className="text-primary font-medium hover:underline">Register here</Link>
              </p>
            </CardContent>
          </Card>
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
