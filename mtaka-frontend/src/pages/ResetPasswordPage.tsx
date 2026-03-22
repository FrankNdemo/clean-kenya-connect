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

const getDashboardPath = (role?: string) => {
  switch (role) {
    case 'resident':
      return '/dashboard/resident';
    case 'collector':
      return '/dashboard/collector';
    case 'recycler':
      return '/dashboard/recycler';
    case 'authority':
      return '/dashboard/authority';
    default:
      return '/login';
  }
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
      navigate(getDashboardPath(user.role), { replace: true });
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
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-success' : 'text-muted-foreground'}`}>
      {met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {text}
    </div>
  );

  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
        <div className="w-full max-w-md">
          <Card className="shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Invalid or Expired Link</CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired. Please request a new one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link to="/forgot-password" className="block">
                <Button className="w-full">Request New Link</Button>
              </Link>
              <Link to="/login" className="block">
                <Button variant="outline" className="w-full">
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
      <div className="w-full max-w-md">
        <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Login
        </Link>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
              <Recycle className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <CardDescription>
              {accountEmail ? `Choose a new password for ${accountEmail}` : 'Enter your new password below'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="space-y-1 rounded-lg bg-secondary/50 p-2">
                  <PasswordRequirement met={passwordValidation.hasMinLength} text="Minimum 8 characters" />
                  <PasswordRequirement met={passwordValidation.hasUppercase} text="At least one uppercase letter" />
                  <PasswordRequirement met={passwordValidation.hasSymbol} text="At least one symbol (!@#$%^&*)" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && (
                  <p className={`text-xs ${passwordsMatch ? 'text-success' : 'text-destructive'}`}>
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || !passwordValidation.isValid || !passwordsMatch}>
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
