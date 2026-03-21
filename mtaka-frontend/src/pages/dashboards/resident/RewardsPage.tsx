import { useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { redeemReward, getRewardRedemptions, RewardRedemption } from '@/lib/store';
import { Award, Gift, Star, TrendingUp, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const rewards = [
  { id: '1', name: 'Eco Shopping Bag', points: 100, image: '🛍️' },
  { id: '2', name: 'Plant a Tree Certificate', points: 250, image: '🌳' },
  { id: '3', name: 'Recycling Kit', points: 500, image: '♻️' },
  { id: '4', name: 'Solar Phone Charger', points: 1000, image: '🔋' },
  { id: '5', name: 'County Bus Pass (1 Month)', points: 1500, image: '🚌' },
];

export default function RewardsPage() {
  const { user, switchUser } = useAuth();
  const [userPoints, setUserPoints] = useState(user?.rewardPoints || 0);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>(() => 
    user ? getRewardRedemptions(user.id) : []
  );

  if (!user) return null;

  const handleRedeem = (reward: typeof rewards[0]) => {
    if (userPoints < reward.points) {
      toast.error('Not enough points to redeem this reward');
      return;
    }
    
    const success = redeemReward(user.id, reward.name, reward.points);
    if (success) {
      switchUser(user.id); // refresh user data
      setUserPoints(prev => prev - reward.points);
      setRedemptions(getRewardRedemptions(user.id));
      toast.success(`🎉 Successfully redeemed "${reward.name}"!`);
    } else {
      toast.error('Failed to redeem reward');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Rewards</h1>
          <p className="text-muted-foreground">Redeem your eco-points for exciting rewards</p>
        </div>

        {/* Points Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Award className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Available Points</p>
                  <p className="text-2xl font-bold text-primary">{userPoints}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Points Earned (Month)</p>
                  <p className="text-2xl font-bold">+{Math.floor(userPoints * 0.3)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <Star className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rewards Redeemed</p>
                  <p className="text-2xl font-bold">{redemptions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Available Rewards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Available Rewards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rewards.map((reward) => {
                const canRedeem = userPoints >= reward.points;
                return (
                  <div key={reward.id} className="p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow">
                    <div className="text-4xl mb-3">{reward.image}</div>
                    <h3 className="font-semibold mb-1">{reward.name}</h3>
                    <p className="text-sm text-primary font-medium mb-3">{reward.points} points</p>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!canRedeem}
                      onClick={() => handleRedeem(reward)}
                    >
                      {canRedeem ? 'Redeem Now' : `Need ${reward.points - userPoints} more pts`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Redemption History */}
        {redemptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                Redemption History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {redemptions.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <p className="font-medium">{r.rewardName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.redeemedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-sm text-destructive font-medium">-{r.pointsCost} pts</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* How to Earn */}
        <Card>
          <CardHeader>
            <CardTitle>How to Earn Points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <span className="text-2xl">🗑️</span>
                <div>
                  <p className="font-medium">Schedule Pickup</p>
                  <p className="text-sm text-muted-foreground">+10 points per collection</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <span className="text-2xl">📍</span>
                <div>
                  <p className="font-medium">Report Illegal Dumping</p>
                  <p className="text-sm text-muted-foreground">+25 points per verified report</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <span className="text-2xl">🎉</span>
                <div>
                  <p className="font-medium">Join Community Events</p>
                  <p className="text-sm text-muted-foreground">+50-100 points per event</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <span className="text-2xl">♻️</span>
                <div>
                  <p className="font-medium">Recycle Materials</p>
                  <p className="text-sm text-muted-foreground">+5 points per kg recycled</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
