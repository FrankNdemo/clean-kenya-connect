import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Recycle, ArrowLeft, Mail, User, Phone, MapPin, Users, Truck, Factory, Building2, Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isStandaloneAppMode } from '@/lib/appMode';
import { toast } from 'sonner';
import { UserRole } from '@/lib/store';
import axios from 'axios';

const roles: { value: UserRole; label: string; icon: typeof Users; description: string }[] = [
  { value: 'resident', label: 'Resident', icon: Users, description: 'Schedule pickups, report issues, join events' },
  { value: 'collector', label: 'Collector', icon: Truck, description: 'Manage routes and collection requests' },
  { value: 'recycler', label: 'Recycler', icon: Factory, description: 'Record and manage recycling transactions' },
  { value: 'authority', label: 'County Authority', icon: Building2, description: 'Monitor metrics and manage the system' },
];

const validatePassword = (password: string) => {
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

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    companyName: '',
    licenseNumber: '',
    countyOfOperation: '',
    role: '' as UserRole | '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const isStandaloneApp = isStandaloneAppMode();

  const passwordValidation = validatePassword(formData.password);
  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0;

  const getErrorMessage = (error: unknown) => {
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      return 'Registration took too long to respond. If your account was created, we will try to sign you in automatically.';
    }

    if (!axios.isAxiosError(error) || !error.response?.data) {
      return (error as Error)?.message || 'Registration failed. Please try again.';
    }

    const payload = error.response.data as Record<string, unknown>;
    const firstMessage = Object.values(payload)[0];
    if (Array.isArray(firstMessage)) {
      return String(firstMessage[0] || 'Registration failed. Please try again.');
    }
    return String(payload.detail || firstMessage || 'Registration failed. Please try again.');
  };

  const redirectToDashboard = (role: UserRole) => {
    switch (role) {
      case 'resident':
        navigate('/dashboard/resident');
        break;
      case 'collector':
        navigate('/dashboard/collector');
        break;
      case 'recycler':
        navigate('/dashboard/recycler');
        break;
      case 'authority':
        navigate('/dashboard/authority');
        break;
      default:
        navigate('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.role) {
      toast.error('Please select a role');
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

    if ((formData.role === 'collector' || formData.role === 'recycler')) {
      if (!formData.companyName.trim()) {
        toast.error('Company name is required for collectors and recyclers');
        return;
      }
      if (!formData.licenseNumber.trim()) {
        toast.error('License number is required for collectors and recyclers');
        return;
      }
    }

    setIsLoading(true);

    try {
      const user = await register({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        role: formData.role as UserRole,
        password: formData.password,
        companyName: formData.companyName,
        licenseNumber: formData.licenseNumber,
        countyOfOperation: formData.countyOfOperation,
      });

      toast.success(`Welcome to M-Taka, ${user.name || user.email}!`);
      redirectToDashboard(user.role);
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        try {
          const recoveredUser = await login(formData.email, formData.password);
          if (recoveredUser) {
            toast.success(`Welcome to M-Taka, ${recoveredUser.name || recoveredUser.email}!`);
            redirectToDashboard(recoveredUser.role);
            return;
          }
        } catch {
          // Fall through to the timeout message below.
        }
      }

      toast.error(getErrorMessage(error));
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4 py-12">
      <div className="w-full max-w-lg">
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
            <CardTitle className="text-2xl">Join M-Taka</CardTitle>
            <CardDescription>Create your account and start making a difference</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role Selection */}
              <div className="space-y-2">
                <Label>Select Your Role</Label>
                <div className="grid grid-cols-2 gap-3">
                  {roles.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: role.value })}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        formData.role === role.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <role.icon className={`w-6 h-6 mb-2 ${formData.role === role.value ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="font-semibold text-sm">{role.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{role.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Kamau"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+254 712 345 678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {formData.role !== 'authority' && (
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="location"
                      placeholder="Westlands, Nairobi"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              {formData.role === 'authority' && (
                <div className="space-y-2">
                  <Label htmlFor="countyOfOperation">County of operation</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="countyOfOperation"
                      placeholder="Nairobi"
                      value={formData.countyOfOperation}
                      onChange={(e) => setFormData({ ...formData, countyOfOperation: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              {(formData.role === 'collector' || formData.role === 'recycler') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="companyName"
                        placeholder="GreenCycle Ltd"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">License number</Label>
                    <div className="relative">
                      <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="licenseNumber"
                        placeholder="LIC-2026-001"
                        value={formData.licenseNumber}
                        onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password (min 8 characters)"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="space-y-1 p-2 bg-secondary/50 rounded-lg">
                  <PasswordRequirement met={passwordValidation.hasMinLength} text="Minimum 8 characters" />
                  <PasswordRequirement met={passwordValidation.hasUppercase} text="At least one uppercase letter" />
                  <PasswordRequirement met={passwordValidation.hasSymbol} text="At least one symbol (!@#$%^&*)" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formData.confirmPassword && (
                  <p className={`text-xs ${passwordsMatch ? 'text-success' : 'text-destructive'}`}>
                    {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || !passwordValidation.isValid || !passwordsMatch}>
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>

            <p className="text-sm text-center text-muted-foreground mt-6">
              Already have an account?{' '}
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
