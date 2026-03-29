import { Recycle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isStandaloneAppMode } from '@/lib/appMode';
import { useAuth } from '@/hooks/useAuth';

export function Footer() {
  const { user } = useAuth();
  const isStandalone = isStandaloneAppMode();
  const showWebsiteMarketingLinks = !user && !isStandalone;
  const quickLinks = [
    ...(showWebsiteMarketingLinks ? [{ label: 'Home', to: '/' }] : []),
    { label: 'Community Events', to: '/events' },
    ...(showWebsiteMarketingLinks ? [{ label: 'About M-Taka', to: '/about' }] : []),
    { label: 'Join Us', to: '/register' },
  ];

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Recycle className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">M-Taka</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-md">
              Smart Waste Management & Community Engagement System. Together, we're building cleaner, 
              healthier communities across Kenya through technology and collective action.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {quickLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold mb-4">Contact</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>City Hall, Nairobi</li>
              <li>linkentnerg@gmail.com</li>
              <li>+254 114 470 441</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2026 M-Taka. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            Made for all Kenyan's
          </p>
        </div>
      </div>
    </footer>
  );
}
