import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isStandaloneAppMode } from '@/lib/appMode';
import { 
  Recycle, 
  Truck, 
  Users, 
  MapPin, 
  Award, 
  ArrowRight,
  Leaf,
  Calendar,
  BarChart3,
  CheckCircle,
  Headphones,
  Download
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import heroBg from '@/assets/hero-bg.jpg';

const features = [
  {
    icon: Truck,
    title: 'Schedule Pickups',
    description: 'Book waste collection at your convenience. Choose date, time, and waste type.',
  },
  {
    icon: MapPin,
    title: 'Report Dumping',
    description: 'Spot illegal dumping? Report it instantly with location and photo.',
  },
  {
    icon: Calendar,
    title: 'Community Events',
    description: 'Join cleanups, tree planting, and recycling drives in your area.',
  },
  {
    icon: Award,
    title: 'Earn Rewards',
    description: 'Get points for every eco-action. Redeem for exciting rewards.',
  },
];

const stats = [
  { value: '50K+', label: 'Active Users' },
  { value: '120', label: 'Tons Recycled' },
  { value: '500+', label: 'Events Held' },
  { value: '47', label: 'Counties' },
];

const roles = [
  {
    title: 'Resident',
    description: 'Schedule pickups, report issues, join events, earn rewards.',
    icon: Users,
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Collector',
    description: 'Manage routes, accept pickups, track collections.',
    icon: Truck,
    color: 'bg-info/10 text-info',
  },
  {
    title: 'Recycler',
    description: 'Record transactions, track materials, manage inventory.',
    icon: Recycle,
    color: 'bg-success/10 text-success',
  },
  {
    title: 'Authority',
    description: 'Monitor metrics, approve events, manage the system.',
    icon: BarChart3,
    color: 'bg-accent/20 text-accent-foreground',
  },
];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function LandingPage() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installHelpMessage, setInstallHelpMessage] = useState('');

  const isIosSafariLike = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isWebkit = /WebKit/i.test(ua);
    const isCriOS = /CriOS/i.test(ua);
    const isFxiOS = /FxiOS/i.test(ua);
    return isIos && isWebkit && !isCriOS && !isFxiOS;
  }, []);

  const isStandalone = isStandaloneAppMode();

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (isStandalone) {
      setShowIosHint(false);
      setInstallHelpMessage('M-Taka is already installed on this device.');
      return;
    }

    if (installPromptEvent) {
      setShowIosHint(false);
      setInstallHelpMessage('');
      setIsInstalling(true);
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      setInstallPromptEvent(null);
      setIsInstalling(false);
      if (choice.outcome === 'accepted') {
        setInstallHelpMessage('Install started. Open M-Taka from your Home Screen once complete.');
      } else {
        setInstallHelpMessage('Install was dismissed. Tap Download App again whenever you are ready.');
      }
      return;
    }

    if (isIosSafariLike) {
      setShowIosHint(true);
      setInstallHelpMessage('');
      return;
    }

    setShowIosHint(false);
    if (!window.isSecureContext) {
      setInstallHelpMessage('Install is blocked on non-HTTPS pages. Open M-Taka on a secure HTTPS domain, then tap Download App.');
      return;
    }
    setInstallHelpMessage('Open your browser menu and tap Install app or Add to Home Screen.');
  };

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Background Image */}
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
              <Leaf className="w-4 h-4" />
              Smart Waste Management for Kenya
            </div>
            
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              Building a
              <span className="text-gradient"> Cleaner Tomorrow</span>
              , Together
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              M-Taka connects communities, collectors, and authorities to create 
              a sustainable waste management ecosystem. Schedule pickups, report issues, 
              and earn rewards for your eco-actions.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <Link to="/register">
                <Button variant="hero" size="xl" className="w-full sm:w-auto">
                  Get Started Free
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link to="/about">
                <Button variant="outline" size="xl" className="w-full sm:w-auto">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-bold mb-1">{stat.value}</div>
                <div className="text-sm opacity-80">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need for
              <span className="text-primary"> Sustainable Living</span>
            </h2>
            <p className="text-muted-foreground">
              M-Taka provides all the tools for effective waste management and community engagement.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="stat-card group cursor-pointer"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <feature.icon className="w-6 h-6 text-primary group-hover:text-primary-foreground transition-colors" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              One Platform,
              <span className="text-primary"> Many Roles</span>
            </h2>
            <p className="text-muted-foreground">
              Whether you're a resident, collector, recycler, or county official, M-Taka has a dashboard for you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roles.map((role, index) => (
              <div 
                key={index}
                className="bg-card rounded-xl p-6 border border-border hover:shadow-lg transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl ${role.color} flex items-center justify-center mb-4`}>
                  <role.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{role.title}</h3>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/register">
              <Button size="lg" className="gap-2">
                Choose Your Role
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How It
              <span className="text-primary"> Works</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: '01', title: 'Sign Up', description: 'Create your account and select your role.' },
              { step: '02', title: 'Take Action', description: 'Schedule pickups, join events, or manage collections.' },
              { step: '03', title: 'Earn Rewards', description: 'Get points for every eco-action and redeem rewards.' },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Make a Difference?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of Kenyans already using M-Taka to build cleaner, healthier communities.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/register">
              <Button variant="accent" size="xl" className="gap-2">
                Get Started Now
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <a href="mailto:support@mtaka.co.ke">
              <Button variant="outline" size="xl" className="gap-2 bg-white/10 border-white/30 hover:bg-white/20">
                <Headphones className="w-5 h-5" />
                Contact Support
              </Button>
            </a>
            <Button
              onClick={handleInstallClick}
              variant="outline"
              size="xl"
              className="gap-2 bg-white/10 border-white/30 hover:bg-white/20"
              disabled={isInstalling}
            >
              <Download className="w-5 h-5" />
              {isInstalling ? 'Preparing Install...' : 'Download App'}
            </Button>
          </div>
          {showIosHint && (
            <p className="mt-4 text-sm opacity-90">
              On iPhone: tap Share, then select Add to Home Screen to install M-Taka.
            </p>
          )}
          {!showIosHint && installHelpMessage && (
            <p className="mt-4 text-sm opacity-90">{installHelpMessage}</p>
          )}
        </div>
      </section>
    </Layout>
  );
}
