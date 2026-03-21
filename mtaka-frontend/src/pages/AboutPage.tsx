import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { 
  Recycle, 
  Target, 
  Users, 
  Award, 
  Shield,
  Smartphone,
  Globe,
  CheckCircle
} from 'lucide-react';

const values = [
  {
    icon: Target,
    title: 'Our Mission',
    description: 'To revolutionize waste management in Kenya through technology, community engagement, and sustainable practices.',
  },
  {
    icon: Globe,
    title: 'Our Vision',
    description: 'A cleaner, healthier Kenya where every community has access to efficient waste management services.',
  },
  {
    icon: Users,
    title: 'Community First',
    description: 'We believe in the power of communities working together to create lasting environmental change.',
  },
];

const features = [
  'Convenient waste pickup scheduling',
  'Illegal dumping reporting system',
  'Community event organization',
  'Reward points for eco-actions',
  'Real-time collection tracking',
  'County-wide analytics dashboard',
];

export default function AboutPage() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 bg-gradient-to-br from-primary/10 via-background to-success/10">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Recycle className="w-4 h-4" />
            About M-Taka
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Building a Cleaner Kenya,
            <span className="text-primary"> Together</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            M-Taka is Kenya's smart waste management platform connecting residents, collectors, 
            recyclers, and county authorities to create a sustainable future.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <div key={index} className="text-center p-8 rounded-2xl bg-card border border-border">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <value.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                <p className="text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">
                What Makes M-Taka
                <span className="text-primary"> Different</span>
              </h2>
              <p className="text-muted-foreground mb-8">
                We've built a comprehensive platform that addresses every aspect of waste management,
                from scheduling pickups to tracking recycling impact.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="p-6 rounded-2xl bg-primary text-primary-foreground">
                  <Smartphone className="w-10 h-10 mb-4" />
                  <div className="text-2xl font-bold">Mobile First</div>
                  <p className="text-sm opacity-80">Designed for easy use on any device</p>
                </div>
                <div className="p-6 rounded-2xl bg-card border border-border">
                  <Award className="w-10 h-10 mb-4 text-accent" />
                  <div className="text-2xl font-bold">Rewards</div>
                  <p className="text-sm text-muted-foreground">Earn points for eco-actions</p>
                </div>
              </div>
              <div className="space-y-4 pt-8">
                <div className="p-6 rounded-2xl bg-card border border-border">
                  <Shield className="w-10 h-10 mb-4 text-success" />
                  <div className="text-2xl font-bold">Secure</div>
                  <p className="text-sm text-muted-foreground">Your data is protected</p>
                </div>
                <div className="p-6 rounded-2xl bg-success text-success-foreground">
                  <Users className="w-10 h-10 mb-4" />
                  <div className="text-2xl font-bold">Community</div>
                  <p className="text-sm opacity-80">Join thousands of Kenyans</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
            Join M-Taka today and be part of the movement for a cleaner Kenya.
          </p>
          <Link to="/register">
            <Button variant="accent" size="xl">
              Create Your Account
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
