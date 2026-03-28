import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Recycle, ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { requestPasswordReset } from '@/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const cardClassName = 'border border-primary/10 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.2)]';
  const accentTextClassName = 'text-primary';
  const accentSoftSurfaceClassName = 'bg-primary/10';
  const accentButtonClassName =
    'h-10 w-full rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90';
  const inputClassName =
    'h-10 rounded-full border-0 bg-primary/10 pl-10 text-sm text-foreground shadow-none placeholder:text-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setIsEmailSent(true);
      toast.success('If that email is registered, a reset link has been sent.');
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        'Unable to send the reset email right now.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isEmailSent) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-md">
          <Card className={cardClassName}>
            <CardHeader className="text-center">
              <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${accentSoftSurfaceClassName} ${accentTextClassName}`}>
                <CheckCircle className="h-8 w-8" />
              </div>
              <CardTitle className={`text-2xl font-semibold ${accentTextClassName}`}>Check Your Email</CardTitle>
              <CardDescription className="text-slate-500">
                If an account exists for <strong>{email}</strong>, a password reset link is on its way.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className={`rounded-xl p-4 text-sm text-slate-600 ${accentSoftSurfaceClassName}`}>
                Open the email from M-Taka No-Reply and use the secure reset link to choose a new password.
              </p>

              <p className="text-center text-sm text-slate-500">
                Didn&apos;t receive the email? Check your spam folder or{' '}
                <button
                  onClick={() => setIsEmailSent(false)}
                  className={`font-medium ${accentTextClassName} hover:underline`}
                >
                  try again
                </button>
              </p>

              <Link to="/login" className="block">
                <Button variant="outline" className="w-full border-primary/20 text-primary hover:bg-primary/10 hover:text-primary">
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
            <CardTitle className={`text-2xl font-semibold ${accentTextClassName}`}>Forgot Password?</CardTitle>
            <CardDescription className="text-slate-500">
              Enter your email address and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/65" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClassName}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className={accentButtonClassName}
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Remember your password?{' '}
              <Link to="/login" className={`font-medium ${accentTextClassName} hover:underline`}>
                Sign in here
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
