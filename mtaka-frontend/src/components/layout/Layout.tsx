import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { isStandaloneAppMode } from '@/lib/appMode';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

interface LayoutProps {
  children: ReactNode;
  showFooter?: boolean;
}

export function Layout({ children, showFooter = true }: LayoutProps) {
  const location = useLocation();
  const isStandalone = isStandaloneAppMode();
  const hideFooterForStandaloneEvents = isStandalone && location.pathname.startsWith('/events');
  const shouldShowFooter = showFooter && !hideFooterForStandaloneEvents;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-16">
        {children}
      </main>
      {shouldShowFooter && <Footer />}
    </div>
  );
}
