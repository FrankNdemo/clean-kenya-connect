import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Recycle, ArrowLeft, Lock, Eye, EyeOff, Check, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { validatePasswordResetToken } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { getDashboardPathForUser } from '@/lib/dashboardPaths';

const validatePasswordRules = (password: string) => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  return {
    hasMinLength,
    hasUppercase,
    hasSymbol,
    isValid: hasMinLength && hasUppercase && hasSymbol,
  };
};

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { completePasswordReset } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const cardClassName = 'border border-primary/10 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.2)]';
  const accentTextClassName = 'text-primary';
  const accentSoftSurfaceClassName = 'bg-primary/10';
  const accentButtonClassName =
    'h-10 w-full rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 disabled:bg-primary/40 disabled:text-primary-foreground';
  const outlineButtonClassName = 'w-full border-primary/20 text-primary hover:bg-primary/10 hover:text-primary';
  const inputClassName =
    'h-10 rounded-[1rem] border border-border bg-white pl-10 pr-10 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20';

  const passwordValidation = validatePasswordRules(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    let cancelled = false;

    if (!uid || !token) {
      setIsValidToken(false);
      return () => {
        cancelled = true;
      };
    }

    const runValidation = async () => {
      try {
        const data = await validatePasswordResetToken(uid, token);
        if (cancelled) return;
        setAccountEmail(data.email || '');
        setIsValidToken(true);
      } catch {
        if (cancelled) return;
        setIsValidToken(false);
      }
    };

    runValidation();

    return () => {
      cancelled = true;
    };
  }, [token, uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uid || !token) {
      toast.error('This password reset link is invalid or incomplete.');
      return;
    }

    if (!passwordValidation.isValid) {
      toast.error('Please ensure your password meets all requirements');
      return;
    }

    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const user = await completePasswordReset(uid, token, password);
      if (!user) {
        toast.error('Failed to reset password. Please try again.');
        return;
      }

      toast.success('Password reset successful. You are now signed in.');
      navigate(getDashboardPathForUser(user), { replace: true });
    } catch (error: any) {
      const detailPayload = error?.response?.data?.detail;
      const detail = Array.isArray(detailPayload) ? detailPayload[0] : detailPayload;
      const passwordPayload = error?.response?.data?.password;
      const passwordError = Array.isArray(passwordPayload) ? passwordPayload[0] : passwordPayload;
      toast.error(detail || passwordError || error?.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  const PasswordRequirement = ({ met, text }: { met: boolean; text: string }) => (
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-primary' : 'text-muted-foreground'}`}>
      {met ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
      <span>{text}</span>
    </div>
  );

  if (isValidToken === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-slate-500">Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-md">
          <Card className={cardClassName}>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-semibold text-foreground">Invalid or Expired Link</CardTitle>
              <CardDescription className="text-slate-500">
                This password reset link is invalid or has expired. Please request a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link to="/forgot-password" className="block">
                <Button className={accentButtonClassName}>Request New Link</Button>
              </Link>
              <Link to="/login" className="block">
                <Button variant="outline" className={outlineButtonClassName}>
                  Back to Login
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md">
        <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Back to Login
        </Link>

        <Card className={cardClassName}>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Recycle className="h-8 w-8" />
            </div>
            <CardTitle className={`text-2xl font-semibold ${accentTextClassName}`}>Reset Password</CardTitle>
            <CardDescription className="text-slate-500">
              {accountEmail ? `Choose a new password for ${accountEmail}` : 'Enter your new password below'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/65" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClassName}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/65 transition-colors hover:text-primary"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className={`space-y-1 rounded-xl p-3 ${accentSoftSurfaceClassName}`}>
                  <PasswordRequirement met={passwordValidation.hasMinLength} text="Minimum 8 characters" />
                  <PasswordRequirement met={passwordValidation.hasUppercase} text="At least one uppercase letter" />
                  <PasswordRequirement met={passwordValidation.hasSymbol} text="At least one symbol (!@#$%^&*)" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-700">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/65" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClassName}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/65 transition-colors hover:text-primary"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && (
                  <p className={`text-xs ${passwordsMatch ? 'text-primary' : 'text-destructive'}`}>
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className={accentButtonClassName}
                disabled={isLoading || !passwordValidation.isValid || !passwordsMatch}
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
