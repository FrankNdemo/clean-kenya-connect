import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Building2, Check, Eye, EyeOff, Lock, Mail, MapPin, Phone, Recycle, Truck, User, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { UserRole } from '@/lib/store';
import { cn } from '@/lib/utils';
import axios from 'axios';

const roles: { value: UserRole; label: string; description: string; surface: string; text: string }[] = [
  {
    value: 'resident',
    label: 'Resident',
    description: 'Schedule pickups, report issues, join events',
    surface: '#056b10',
    text: '#ffffff',
  },
  {
    value: 'collector',
    label: 'Collector',
    description: 'Manage routes and collection requests',
    surface: '#6ea964',
    text: '#173f31',
  },
  {
    value: 'recycler',
    label: 'Recycler',
    description: 'Record and manage recycling transactions',
    surface: '#004b28',
    text: '#ffffff',
  },
  {
    value: 'authority',
    label: 'County Authority',
    description: 'Monitor metrics and manage the system',
    surface: '#a7cfca',
    text: '#173f31',
  },
];

const fieldClass =
  'h-11 rounded-[10px] border-border bg-card text-[13px] shadow-none placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/15';

const validatePassword = (password: string) => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};'"'"':"\\|,.<>\/?]/.test(password);

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
  const [isChoosingRole, setIsChoosingRole] = useState(true);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const selectedRole = formData.role ? roles.find((role) => role.value === formData.role) : undefined;
  const passwordValidation = validatePassword(formData.password);
  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0;
  const isBusinessRole = formData.role === 'collector' || formData.role === 'recycler';
  const hasRequiredIdentityDetails =
    formData.name.trim().length > 0 &&
    formData.email.trim().length > 0 &&
    formData.phone.trim().length > 0 &&
    (formData.role === 'authority' ? formData.countyOfOperation.trim().length > 0 : formData.location.trim().length > 0);
  const hasRequiredBusinessDetails =
    !isBusinessRole || (formData.companyName.trim().length > 0 && formData.licenseNumber.trim().length > 0);
  const isSubmitReady = hasRequiredIdentityDetails && hasRequiredBusinessDetails && passwordValidation.isValid && passwordsMatch;
  const formColumnStyle = { width: '100%', maxWidth: '360px' } as const;
  const dividerBarClass = 'h-[8px] w-[78px] rounded-[2px] border border-primary/30 bg-primary/20';
  const titleBadgeClass = 'inline-flex items-center justify-center rounded-[10px] bg-primary/10 px-8 py-2';
  const roleCardBaseClass =
    'mx-auto block w-full overflow-hidden border-[1.5px] px-6 py-5 text-center shadow-none transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 sm:px-7';
  const roleCardContentClass = 'mx-auto flex max-w-[13.75rem] flex-col items-center justify-center gap-2';
  const roleLabelClass = 'text-[15px] font-semibold leading-none tracking-tight';
  const roleDescriptionClass = 'text-[10px] leading-[1.2] opacity-95';
  const formLabelClass = 'text-[12px] font-medium text-foreground';
  const inputIconWrapClass = 'pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center';
  const inputIconClass = 'h-4 w-4 text-primary/55';
  const inputWithIconStyle = { paddingLeft: '3rem' } as const;
  const inputWithDualIconsStyle = { paddingLeft: '3rem', paddingRight: '2.75rem' } as const;
  const registerCardClassName = cn(
    'mx-auto flex w-full flex-col items-center rounded-[2rem] border border-primary/5 bg-white px-5 py-6 shadow-[0_28px_70px_-36px_rgba(15,23,42,0.4)] sm:px-7 sm:py-8',
    isChoosingRole
      ? 'max-w-[22.5rem] sm:max-w-[24rem] lg:max-w-[40rem] lg:px-8'
      : 'max-w-[22.5rem] sm:max-w-[24rem] lg:max-w-[25rem] lg:px-8'
  );

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

  const handleRoleSelect = (role: UserRole) => {
    setFormData((prev) => ({ ...prev, role }));
    setIsChoosingRole(false);
  };

  const handleBackToRoles = () => {
    setIsChoosingRole(true);
    setFormData((prev) => ({ ...prev, role: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.role) {
      toast.error('Please select a role');
      return;
    }

    if (formData.role !== 'authority' && !formData.location.trim()) {
      toast.error('Location is required for this role');
      return;
    }

    if (formData.role === 'authority' && !formData.countyOfOperation.trim()) {
      toast.error('County of operation is required for county authority accounts');
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

    if (isBusinessRole) {
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
    <div className={`flex items-center gap-2 text-[11px] ${met ? 'text-primary' : 'text-destructive'}`}>
      {met ? <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" /> : <X className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />}
      <span>{text}</span>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background px-3 py-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-8">
      <main className={registerCardClassName}>
        <div className="flex w-full flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
            <Recycle className="h-7 w-7" />
          </div>

          <div className={titleBadgeClass}>
            <h1 className="text-[28px] font-semibold leading-none tracking-tight text-primary">
              Join M-Taka
            </h1>
          </div>

          <div className="mt-3 flex w-full items-center justify-center gap-2 whitespace-nowrap text-[#6a746f]">
            {isChoosingRole && (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
                aria-label="Back to login"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
            )}
            <p className="rounded-[4px] bg-white px-2 py-1 text-[11px] leading-none text-[#6a746f] sm:text-[12px]">
              Create your account and start making a difference
            </p>
          </div>
        </div>

        {isChoosingRole ? (
          <section className="mt-6 w-full text-center">
            <div className="flex items-center justify-center gap-3">
              <span className={dividerBarClass} />
              <span className="shrink-0 text-[13px] font-semibold text-primary">
                Select Your Role
              </span>
              <span className={dividerBarClass} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {roles.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => handleRoleSelect(role.value)}
                  className={roleCardBaseClass}
                  style={{
                    backgroundColor: role.surface,
                    color: role.text,
                    borderColor: '#1f3a33',
                    borderRadius: '14px',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                  aria-label={`Register as ${role.label}`}
                >
                  <div className={roleCardContentClass}>
                    <div className={roleLabelClass}>{role.label}</div>
                    <div className={roleDescriptionClass}>{role.description}</div>
                  </div>
                </button>
              ))}
            </div>

            <p className="mt-12 text-center text-[11px] text-[#6a746f] sm:text-[12px]">
              <span>Already have an account? </span>
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in here
              </Link>
            </p>
          </section>
        ) : selectedRole ? (
          <form onSubmit={handleSubmit} className="mt-6 w-full text-left" style={formColumnStyle}>
            <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 text-[#8d948f]">
              <button
                type="button"
                onClick={handleBackToRoles}
                className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>

              <div className="flex items-center justify-center gap-3">
                <span className={dividerBarClass} />
                <span className="shrink-0 text-[13px] font-semibold text-primary">
                  Select Your Role
                </span>
                <span className={dividerBarClass} />
              </div>

              <div aria-hidden="true" className="h-8" />
            </div>

            <div
              className={[roleCardBaseClass, 'mt-3 cursor-default'].join(' ')}
              style={{
                backgroundColor: selectedRole.surface,
                color: selectedRole.text,
                borderColor: '#1f3a33',
                borderRadius: '14px',
              }}
            >
              <div className={roleCardContentClass}>
                <div className={roleLabelClass}>{selectedRole.label}</div>
                <div className={roleDescriptionClass}>{selectedRole.description}</div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className={formLabelClass}>
                  Full Name
                </Label>
                <div className="relative">
                  <div className={inputIconWrapClass}>
                    <User className={inputIconClass} />
                  </div>
                  <Input
                    id="name"
                    placeholder="John Kamau"
                    autoComplete="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={fieldClass}
                    style={inputWithIconStyle}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className={formLabelClass}>
                  Email Address
                </Label>
                <div className="relative">
                  <div className={inputIconWrapClass}>
                    <Mail className={inputIconClass} />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@email.com"
                    autoComplete="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={fieldClass}
                    style={inputWithIconStyle}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className={formLabelClass}>
                  Phone Number
                </Label>
                <div className="relative">
                  <div className={inputIconWrapClass}>
                    <Phone className={inputIconClass} />
                  </div>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+254 712 345 678"
                    autoComplete="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={fieldClass}
                    style={inputWithIconStyle}
                    required
                  />
                </div>
              </div>

              {formData.role !== 'authority' && (
                <div className="space-y-1.5">
                  <Label htmlFor="location" className={formLabelClass}>
                    Location
                  </Label>
                  <div className="relative">
                    <div className={inputIconWrapClass}>
                      <MapPin className={inputIconClass} />
                    </div>
                    <Input
                      id="location"
                      placeholder="Westlands, Nairobi"
                      autoComplete="address-level2"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className={fieldClass}
                      style={inputWithIconStyle}
                      required
                    />
                  </div>
                </div>
              )}

              {formData.role === 'authority' && (
                <div className="space-y-1.5">
                  <Label htmlFor="countyOfOperation" className={formLabelClass}>
                    County of operation
                  </Label>
                  <div className="relative">
                    <div className={inputIconWrapClass}>
                      <MapPin className={inputIconClass} />
                    </div>
                    <Input
                      id="countyOfOperation"
                      placeholder="Nairobi"
                      autoComplete="address-level1"
                      value={formData.countyOfOperation}
                      onChange={(e) => setFormData({ ...formData, countyOfOperation: e.target.value })}
                      className={fieldClass}
                      style={inputWithIconStyle}
                      required
                    />
                  </div>
                </div>
              )}

              {isBusinessRole && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName" className={formLabelClass}>
                      Company name
                    </Label>
                    <div className="relative">
                      <div className={inputIconWrapClass}>
                        <Building2 className={inputIconClass} />
                      </div>
                      <Input
                        id="companyName"
                        placeholder="GreenCycle Ltd"
                        autoComplete="organization"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        className={fieldClass}
                        style={inputWithIconStyle}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="licenseNumber" className={formLabelClass}>
                      License number
                    </Label>
                    <div className="relative">
                      <div className={inputIconWrapClass}>
                        <Truck className={inputIconClass} />
                      </div>
                      <Input
                        id="licenseNumber"
                        placeholder="LIC-2026-001"
                        autoComplete="off"
                        value={formData.licenseNumber}
                        onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                        className={fieldClass}
                        style={inputWithIconStyle}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="password" className={formLabelClass}>
                  Password
                </Label>
                <div className="relative">
                  <div className={inputIconWrapClass}>
                    <Lock className={inputIconClass} />
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password (min 8 characters)"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={fieldClass}
                    style={inputWithDualIconsStyle}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/55 transition-colors hover:text-primary"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {formData.password.length > 0 && (
                  <div className="space-y-1.5 rounded-[10px] border border-primary/10 bg-primary/10 px-3 py-2.5">
                    <PasswordRequirement met={passwordValidation.hasMinLength} text="Minimum 8 characters" />
                    <PasswordRequirement met={passwordValidation.hasUppercase} text="At least one uppercase letter" />
                    <PasswordRequirement met={passwordValidation.hasSymbol} text="At least one symbol (!@#$%^&*)" />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className={formLabelClass}>
                  Confirm Password
                </Label>
                <div className="relative">
                  <div className={inputIconWrapClass}>
                    <Lock className={inputIconClass} />
                  </div>
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className={fieldClass}
                    style={inputWithDualIconsStyle}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/55 transition-colors hover:text-primary"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {formData.confirmPassword && (
                  <p className={`text-[11px] ${passwordsMatch ? 'text-success' : 'text-destructive'}`}>
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className={[
                  'mt-2 inline-flex h-11 w-full appearance-none items-center justify-center rounded-[10px] border border-transparent text-[13px] font-semibold shadow-[0_16px_28px_-22px_hsl(var(--primary)/0.75)] transition-colors',
                  isSubmitReady
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-primary/40 text-primary-foreground hover:bg-primary/40',
                ].join(' ')}
                aria-disabled={isLoading || !isSubmitReady}
                disabled={isLoading}
                onClick={(e) => {
                  if (!isSubmitReady || isLoading) {
                    e.preventDefault();
                  }
                }}
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>

            <p className="pt-6 text-center text-[12px] text-[#6a746f]">
              <span>Already have an account? </span>
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in here
              </Link>
            </p>
          </form>
        ) : null}
      </main>
    </div>
  );
}
