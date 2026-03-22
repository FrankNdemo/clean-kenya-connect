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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
        <div className="w-full max-w-md">
          <Card className="shadow-lg">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription>
                If an account exists for <strong>{email}</strong>, a password reset link is on its way.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
                Open the email from M-Taka No-Reply and use the secure reset link to choose a new password.
              </p>

              <p className="text-sm text-center text-muted-foreground">
                Didn&apos;t receive the email? Check your spam folder or{' '}
                <button
                  onClick={() => setIsEmailSent(false)}
                  className="text-primary font-medium hover:underline"
                >
                  try again
                </button>
              </p>

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
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Login
        </Link>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
              <Recycle className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Forgot Password?</CardTitle>
            <CardDescription>
              Enter your email address and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>

            <p className="text-sm text-center text-muted-foreground mt-6">
              Remember your password?{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Sign in here
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
