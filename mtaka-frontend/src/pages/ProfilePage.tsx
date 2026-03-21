import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail, Phone, MapPin, Award, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getProfile, updateProfile } from '@/api';

export default function ProfilePage() {
  const { user, switchUser } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
  });

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      if (!user) {
        navigate('/login');
        return;
      }
      try {
        const data = await getProfile();
        if (!active) return;
        const fullName = `${data?.user?.first_name || ''} ${data?.user?.last_name || ''}`.trim();
        const location =
          data?.profile?.address ||
          data?.profile?.service_areas ||
          data?.profile?.location ||
          data?.profile?.county ||
          user.location ||
          '';
        setFormData({
          name: fullName || data?.user?.username || user.name,
          email: data?.user?.email || user.email,
          phone: data?.user?.phone || user.phone,
          location,
        });
      } catch {
        if (!active) return;
        setFormData({
          name: user.name,
          email: user.email,
          phone: user.phone,
          location: user.location,
        });
      }
    };

    if (!user) {
      navigate('/login');
    } else {
      loadProfile();
    }

    return () => {
      active = false;
    };
  }, [user, navigate]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
      });
      await switchUser(String(user.id));
      toast.success('Profile updated successfully!');
    } catch {
      toast.error('Failed to update profile');
    }
  };

  const getRoleBadgeClass = () => {
    switch (user.role) {
      case 'resident': return 'role-badge-resident';
      case 'collector': return 'role-badge-collector';
      case 'recycler': return 'role-badge-recycler';
      case 'authority': return 'role-badge-authority';
      default: return '';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-muted-foreground">Manage your account settings</p>
        </div>

        <Card>
          <CardHeader className="text-center pb-2">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-primary" />
            </div>
            <CardTitle>{user.name}</CardTitle>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className={`role-badge ${getRoleBadgeClass()}`}>
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </span>
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-accent/20 text-accent-foreground text-xs font-semibold">
                <Award className="w-3 h-3" />
                {user.rewardPoints} points
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="pl-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="pl-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="pl-10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="location" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="pl-10" />
                </div>
              </div>
              <Button type="submit" className="w-full gap-2">
                <Save className="w-4 h-4" />
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
