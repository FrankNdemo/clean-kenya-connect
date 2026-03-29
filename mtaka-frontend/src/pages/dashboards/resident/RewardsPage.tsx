import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import {
  BackendGreenCredit,
  getApiErrorMessage,
  listGreenCreditsApi,
  redeemRewardApi,
} from '@/api';
import { Award, Gift, Star, TrendingUp, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const rewards = [
  { id: '1', name: 'Eco Shopping Bag', points: 100, image: '\u{1F6CD}\uFE0F' },
  { id: '2', name: 'Plant a Tree Certificate', points: 250, image: '\u{1F333}' },
  { id: '3', name: 'Recycling Kit', points: 500, image: '\u267B\uFE0F' },
  { id: '4', name: 'Solar Phone Charger', points: 1000, image: '\u{1F50B}' },
  { id: '5', name: 'County Bus Pass (1 Month)', points: 1500, image: '\u{1F68C}' },
];

const REWARD_REDEMPTION_PREFIX = 'Reward redemption requested: ';

const getRewardLabel = (description: string) => {
  const cleaned = String(description || '').trim();
  if (cleaned.startsWith(REWARD_REDEMPTION_PREFIX)) {
    return cleaned.slice(REWARD_REDEMPTION_PREFIX.length).trim();
  }
  return cleaned || 'Reward';
};

export default function RewardsPage() {
  const { user, switchUser } = useAuth();
  const [userPoints, setUserPoints] = useState(user?.rewardPoints || 0);
  const [redemptions, setRedemptions] = useState<BackendGreenCredit[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);

  useEffect(() => {
    setUserPoints(user?.rewardPoints || 0);
  }, [user?.rewardPoints]);

  useEffect(() => {
    if (!user) {
      setRedemptions([]);
      setIsLoadingHistory(false);
      return;
    }

    let isMounted = true;

    const loadRewardHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const credits = await listGreenCreditsApi();
        if (!isMounted) return;
        setRedemptions(credits.filter((entry) => entry.transaction_type === 'redeemed'));
      } catch {
        if (!isMounted) return;
        toast.error('Unable to load reward history right now.');
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadRewardHistory();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  if (!user) return null;

  const handleRedeem = async (reward: typeof rewards[0]) => {
    if (userPoints < reward.points) {
      toast.error('Not enough points to redeem this reward');
      return;
    }

    try {
      setRedeemingRewardId(reward.id);
      const response = await redeemRewardApi({
        reward_name: reward.name,
        points_cost: reward.points,
      });
      setUserPoints(response.remainingCredits);
      setRedemptions((current) => [response.transaction, ...current]);
      await switchUser(String(user.id));
      toast.success(response.detail || 'Redeem request received. Check your email.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to redeem reward.'));
    } finally {
      setRedeemingRewardId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Rewards</h1>
          <p className="text-muted-foreground">Redeem your eco-points for exciting rewards</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                  <Award className="h-6 w-6 text-primary" />
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
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
                  <TrendingUp className="h-6 w-6 text-success" />
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
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20">
                  <Star className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rewards Redeemed</p>
                  <p className="text-2xl font-bold">{redemptions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Available Rewards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.map((reward) => {
                const canRedeem = userPoints >= reward.points;
                const isRedeeming = redeemingRewardId === reward.id;

                return (
                  <div
                    key={reward.id}
                    className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-3 text-4xl">{reward.image}</div>
                    <h3 className="mb-1 font-semibold">{reward.name}</h3>
                    <p className="mb-3 text-sm font-medium text-primary">{reward.points} points</p>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!canRedeem || isRedeeming}
                      onClick={() => void handleRedeem(reward)}
                    >
                      {isRedeeming
                        ? 'Submitting...'
                        : canRedeem
                        ? 'Redeem Now'
                        : `Need ${reward.points - userPoints} more pts`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {redemptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Redemption History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {redemptions.map((redemption) => (
                  <div
                    key={redemption.id}
                    className="flex items-center justify-between rounded-lg bg-secondary/50 p-3"
                  >
                    <div>
                      <p className="font-medium">{getRewardLabel(redemption.description)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(redemption.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-destructive">
                      -{redemption.credits_amount} pts
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoadingHistory && (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Loading reward history...</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How to Earn Points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
                <span className="text-2xl">{'\u{1F5D1}\uFE0F'}</span>
                <div>
                  <p className="font-medium">Schedule Pickup</p>
                  <p className="text-sm text-muted-foreground">+10 points per collection</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
                <span className="text-2xl">{'\u{1F4CD}'}</span>
                <div>
                  <p className="font-medium">Report Illegal Dumping</p>
                  <p className="text-sm text-muted-foreground">+25 points per verified report</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
                <span className="text-2xl">{'\u{1F389}'}</span>
                <div>
                  <p className="font-medium">Join Community Events</p>
                  <p className="text-sm text-muted-foreground">+50-100 points per event</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
                <span className="text-2xl">{'\u267B\uFE0F'}</span>
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
