import { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { 
  Recycle, 
  Home, 
  Calendar, 
  MapPin, 
  Award, 
  Settings, 
  LogOut,
  Menu,
  X,
  Truck,
  BarChart3,
  FileText,
  Users,
  Package
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/lib/store';

interface DashboardLayoutProps {
  children: ReactNode;
}

const roleNavigation: Record<UserRole, { label: string; icon: typeof Home; href: string }[]> = {
  resident: [
    { label: 'Dashboard', icon: Home, href: '/dashboard/resident' },
    { label: 'My Pickups', icon: Truck, href: '/dashboard/resident/pickups' },
    { label: 'My Recyclables', icon: Package, href: '/dashboard/resident/recyclables' },
    { label: 'My Reports', icon: MapPin, href: '/dashboard/resident/reports' },
    { label: 'Events', icon: Calendar, href: '/events' },
    { label: 'My Events', icon: Calendar, href: '/events/my-events' },
    { label: 'My Rewards', icon: Award, href: '/dashboard/resident/rewards' },
  ],
  collector: [
    { label: 'Dashboard', icon: Home, href: '/dashboard/collector' },
    { label: 'Pickup Requests', icon: Truck, href: '/dashboard/collector/requests' },
    { label: 'My Routes', icon: MapPin, href: '/dashboard/collector/routes' },
    { label: 'Transactions', icon: FileText, href: '/dashboard/collector/transactions' },
    { label: 'Reports', icon: FileText, href: '/dashboard/collector/reports' },
    { label: 'Events', icon: Calendar, href: '/events' },
    { label: 'My Events', icon: Calendar, href: '/events/my-events' },
  ],
  recycler: [
    { label: 'Dashboard', icon: Home, href: '/dashboard/recycler' },
    { label: 'Available Materials', icon: Package, href: '/dashboard/recycler/available' },
    { label: 'My Inventory', icon: Package, href: '/dashboard/recycler/materials' },
    { label: 'Transactions', icon: FileText, href: '/dashboard/recycler/transactions' },
    { label: 'Analytics', icon: BarChart3, href: '/dashboard/recycler/analytics' },
    { label: 'Events', icon: Calendar, href: '/events' },
    { label: 'My Events', icon: Calendar, href: '/events/my-events' },
  ],
  authority: [
    { label: 'Dashboard', icon: Home, href: '/dashboard/authority' },
    { label: 'Statistics', icon: BarChart3, href: '/dashboard/authority/stats' },
    { label: 'Dumping Reports', icon: MapPin, href: '/dashboard/authority/reports' },
    { label: 'Events', icon: Calendar, href: '/dashboard/authority/events' },
    { label: 'Users', icon: Users, href: '/dashboard/authority/users' },
  ],
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Recycle className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const navigation = roleNavigation[user.role] || [];

  const handleLogout = () => {
    logout();
    navigate('/');
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
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-card border-b border-border flex items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Recycle className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold">M-Taka</span>
        </Link>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-secondary"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 w-64 h-full bg-card border-r border-border transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Recycle className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">M-Taka</span>
          </div>

          {/* User Info */}
          <div className="p-4 border-b border-border">
            <div className="font-semibold">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <span className={`role-badge mt-2 ${getRoleBadgeClass()}`}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border space-y-1">
            <Link
              to="/profile"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Settings className="w-5 h-5" />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
