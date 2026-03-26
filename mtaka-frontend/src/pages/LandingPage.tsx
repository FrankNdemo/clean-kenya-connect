import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Calendar,
  Download,
  Leaf,
  MapPin,
  Recycle,
  Smartphone,
  Truck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Layout } from '@/components/layout/Layout';
import { isStandaloneAppMode } from '@/lib/appMode';
import heroBg from '@/assets/hero-bg.jpg';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type SpotlightCard = {
  title: string;
  description: string;
  badge: string;
  image: string;
  icon: LucideIcon;
};

const features = [
  {
    icon: Truck,
    title: 'Schedule Pickups',
    description: 'Book collection for homes, apartments, offices, and estates with clear time windows.',
  },
  {
    icon: MapPin,
    title: 'Report Dumping',
    description: 'Capture a photo, location, and category so dumping issues are easier to resolve.',
  },
  {
    icon: Calendar,
    title: 'Community Events',
    description: 'Promote clean-ups, tree planting, and recycling drives across neighborhoods.',
  },
  {
    icon: Award,
    title: 'Earn Rewards',
    description: 'Recognize eco-action with points, badges, and community rewards.',
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
    description: 'Schedule pickups, report issues, join events, and earn rewards.',
    icon: Users,
    color: 'bg-primary/10 text-primary',
  },
  {
    title: 'Collector',
    description: 'Manage routes, accept pickups, and track completed collections.',
    icon: Truck,
    color: 'bg-info/10 text-info',
  },
  {
    title: 'Recycler',
    description: 'Record transactions, track materials, and manage recovery flows.',
    icon: Recycle,
    color: 'bg-success/10 text-success',
  },
  {
    title: 'Authority',
    description: 'Monitor metrics, approve events, and manage the system at county scale.',
    icon: BarChart3,
    color: 'bg-accent/20 text-accent-foreground',
  },
];

const environmentHighlights = [
  {
    title: 'Waste operations',
    description: 'Routes, pickups, and completion tracking stay organized and visible in one workflow.',
    icon: Truck,
  },
  {
    title: 'Public events',
    description: 'Community clean-ups, tree planting, and recycling drives are easy to promote and follow.',
    icon: Calendar,
  },
  {
    title: 'Green impact',
    description: 'Show environmental progress with a cleaner, more trustworthy visual story.',
    icon: Leaf,
  },
];

const collectionActions = [
  {
    title: 'Engage in waste collection',
    description: 'Book pickups, track routes, and keep collection work visible to the community.',
    icon: Truck,
  },
  {
    title: 'Activate local events',
    description: 'Promote clean-ups, tree planting, and recycling drives with one shared calendar.',
    icon: Calendar,
  },
  {
    title: 'Close the loop',
    description: 'Follow waste from pickup to recycling, composting, and safe disposal.',
    icon: Recycle,
  },
];

const environmentCards: SpotlightCard[] = [
  {
    title: 'Community clean-ups',
    description: 'Volunteer sign-ups, before-and-after coverage, and cleanup updates in one place.',
    badge: 'Events',
    image: '/landing/community-events.webp',
    icon: Calendar,
  },
  {
    title: 'Waste collection operations',
    description: 'Track routes, pickups, and service performance with a clearer collection workflow.',
    badge: 'Collection',
    image: '/landing/cleanup-truck.jpg',
    icon: Truck,
  },
  {
    title: 'Recycling drives',
    description: 'Track paper, plastic, metal, and glass recovery at community events.',
    badge: 'Recycle',
    image: '/landing/recycling-real.jpg',
    icon: Recycle,
  },
  {
    title: 'Greener neighborhoods',
    description: 'Highlight cleaner parks, volunteer days, and ongoing community stewardship.',
    badge: 'Environment',
    image: '/landing/green-neighborhoods-real.jpg',
    icon: Leaf,
  },
  {
    title: 'Schedule pickups',
    description: 'Book a pickup with collectors near you in a few taps.',
    badge: 'Pickup',
    image: '/landing/pickup-real.jpg',
    icon: Smartphone,
  },
];

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
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${heroBg})`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
        </div>
        <div className="absolute inset-0 -z-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.12),_transparent_38%),radial-gradient(circle_at_bottom_right,_hsl(var(--accent)/0.08),_transparent_32%)]" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary shadow-sm animate-fade-in">
              <Leaf className="h-4 w-4" />
              Smart Waste Management for Kenya
            </div>

            <h1
              className="mt-6 text-4xl font-extrabold leading-tight text-foreground md:text-6xl animate-fade-in"
              style={{ animationDelay: '0.08s' }}
            >
              Building a <span className="text-gradient">Cleaner Tomorrow</span>, Together
            </h1>

            <p
              className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground md:text-xl animate-fade-in"
              style={{ animationDelay: '0.16s' }}
            >
              M-Taka connects communities, collectors, and authorities to create a sustainable waste management ecosystem.
              Schedule pickups, report issues, join events, and earn rewards for your eco-actions.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4 animate-fade-in" style={{ animationDelay: '0.24s' }}>
              <Link to="/register">
                <Button variant="hero" size="xl" className="w-full sm:w-auto">
                  Get Started Free
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/about">
                <Button variant="outline" size="xl" className="w-full sm:w-auto border-primary/40 bg-background/80 text-primary hover:bg-primary/10">
                  Learn More
                </Button>
              </Link>
            </div>

            <p className="mt-8 max-w-lg text-sm leading-6 text-foreground/70 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              Cleaner pickups, better recycling, and visible community action in one place.
            </p>
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

      {/* Environmental Showcase */}
      <section className="relative overflow-hidden py-24 bg-secondary/20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_hsl(var(--accent)/0.14),_transparent_28%)]" />
        <div className="absolute left-0 top-20 -z-10 h-72 w-72 rounded-full bg-success/10 blur-3xl" />
        <div className="absolute right-0 bottom-10 -z-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

        <div className="container mx-auto px-4">
          <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="max-w-xl">
              <Badge className="border-primary/20 bg-primary/10 px-4 py-2 text-primary">
                Waste management, events, and environment
              </Badge>
              <h2 className="mt-6 text-3xl font-bold leading-tight md:text-5xl">
                A cleaner system that looks professional from the first click
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                M-Taka brings collection updates, community clean-ups, recycling drives, and green-environment
                stories into one polished platform so people can see impact, not just messages.
              </p>

              <Card className="mt-8 border-border/70 bg-card/95 shadow-sm">
                <CardHeader className="space-y-3">
                  <Badge className="w-fit border-primary/20 bg-primary/10 text-primary">Action panel</Badge>
                  <CardTitle className="text-2xl">Engage in waste collection</CardTitle>
                  <CardDescription className="leading-7">
                    Keep pickups, events, and recycling visible in one place so the community can take action faster.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {collectionActions.map((item) => (
                      <div key={item.title} className="rounded-2xl bg-muted/60 p-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <h4 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h4>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                    Engage residents, collectors, and county teams with a clearer waste-management workflow.
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link to="/events">
                      <Button variant="hero" size="lg" className="w-full sm:w-auto">
                        View Event Calendar
                      </Button>
                    </Link>
                    <Link to="/register">
                      <Button variant="outline" size="lg" className="w-full sm:w-auto">
                        Join the Platform
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-8 space-y-4">
                {environmentHighlights.map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm backdrop-blur"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {['Pickup tracking', 'Cleanup events', 'Recycling flow', 'Green reports'].map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center rounded-full border border-border/70 bg-card/90 px-4 py-2 text-sm font-medium text-foreground shadow-sm"
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link to="/events">
                  <Button variant="hero" size="xl" className="w-full sm:w-auto">
                    Browse Events
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="outline" size="xl" className="w-full sm:w-auto">
                    Join M-Taka
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {environmentCards.map((card, index) => (
                <Card
                  key={card.title}
                  className={`group overflow-hidden border-border/60 bg-card/95 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${
                    index === 0 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="relative">
                    <img
                      src={card.image}
                      alt={card.title}
                      className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                        index === 0 ? 'aspect-[16/8] sm:aspect-[16/7]' : 'aspect-[4/3]'
                      }`}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/35 via-transparent to-transparent" />
                    <Badge className="absolute left-4 top-4 bg-background/90 text-foreground shadow-sm backdrop-blur">
                      {card.badge}
                    </Badge>
                  </div>
                  <CardHeader className="space-y-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{card.title}</CardTitle>
                      <CardDescription className="mt-2 leading-6">{card.description}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need for
              <span className="text-primary"> Cleaner Communities</span>
            </h2>
            <p className="text-muted-foreground">
              M-Taka gives residents, collectors, recyclers, and county teams the tools to keep waste moving the right way.
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
              How M-Taka
              <span className="text-primary"> Works</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: '01', title: 'Sign Up', description: 'Create your account and select your role in the waste ecosystem.' },
              { step: '02', title: 'Take Action', description: 'Schedule pickups, join events, or manage collections and reporting.' },
              { step: '03', title: 'Earn Recognition', description: 'Get points for every eco-action and redeem rewards.' },
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
            Ready to build cleaner communities?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
            Join M-Taka to schedule pickups, join clean-up events, and keep recyclables moving into the right stream.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/register">
              <Button variant="accent" size="xl" className="gap-2">
                Get Started Now
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/events">
              <Button variant="outline" size="xl" className="gap-2 bg-white/10 border-white/30 hover:bg-white/20">
                <Calendar className="w-5 h-5" />
                Join Cleanups
              </Button>
            </Link>
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
          <p className="mt-4 text-sm opacity-80">
            Need help?{' '}
            <a href="mailto:support@mtaka.co.ke" className="underline underline-offset-4 hover:opacity-100">
              Contact support
            </a>
          </p>
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
