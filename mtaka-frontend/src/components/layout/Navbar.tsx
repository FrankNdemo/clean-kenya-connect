import { Link, useLocation } from 'react-router-dom';
import { Recycle, Menu, X, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  const getDashboardLink = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'resident': return '/dashboard/resident';
      case 'collector': return '/dashboard/collector';
      case 'recycler': return '/dashboard/recycler';
      case 'authority': return '/dashboard/authority';
      default: return '/';
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md group-hover:shadow-glow transition-shadow">
              <Recycle className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">M-Taka</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <Link 
              to="/" 
              className={`text-sm font-medium transition-colors ${isActive('/') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Home
            </Link>
            <Link 
              to="/events" 
              className={`text-sm font-medium transition-colors ${isActive('/events') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Events
            </Link>
            <Link 
              to="/about" 
              className={`text-sm font-medium transition-colors ${isActive('/about') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              About
            </Link>
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link to={getDashboardLink()}>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="w-4 h-4" />
                    {user.name.split(' ')[0]}
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={logout} className="gap-2">
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border animate-fade-in">
            <div className="flex flex-col gap-2">
              <Link 
                to="/" 
                className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Home
              </Link>
              <Link 
                to="/events" 
                className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Events
              </Link>
              <Link 
                to="/about" 
                className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setIsOpen(false)}
              >
                About
              </Link>
              <div className="pt-2 border-t border-border mt-2">
                {user ? (
                  <>
                    <Link 
                      to={getDashboardLink()} 
                      className="block px-4 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <button 
                      onClick={() => { logout(); setIsOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-colors text-destructive"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link 
                      to="/login" 
                      className="block px-4 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      Login
                    </Link>
                    <Link 
                      to="/register" 
                      className="block px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground transition-colors mt-2"
                      onClick={() => setIsOpen(false)}
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
