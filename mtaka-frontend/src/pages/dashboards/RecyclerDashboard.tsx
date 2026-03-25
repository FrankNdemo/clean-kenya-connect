import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { RecyclingTransaction } from '@/lib/store';
import { createRecyclerTransactionDb, fetchRecyclerTransactionsDb } from '@/lib/recyclablesDb';
import {
  Recycle,
  Package,
  DollarSign,
  Plus,
  Scale,
  FileText,
  Cog,
  Droplets,
  Cpu,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

type MaterialOption = {
  type: RecyclingTransaction['materialType'];
  name: string;
  pricePerKg: number;
  icon: LucideIcon;
  tone: string;
};

const materialTypes: MaterialOption[] = [
  { type: 'plastic', name: 'Plastic', icon: Recycle, pricePerKg: 20, tone: 'bg-blue-500/20 text-blue-700 dark:text-blue-300' },
  { type: 'paper', name: 'Paper', icon: FileText, pricePerKg: 8, tone: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  { type: 'metal', name: 'Metal', icon: Cog, pricePerKg: 35, tone: 'bg-slate-500/20 text-slate-700 dark:text-slate-300' },
  { type: 'glass', name: 'Glass', icon: Droplets, pricePerKg: 5, tone: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  { type: 'electronics', name: 'Electronics', icon: Cpu, pricePerKg: 50, tone: 'bg-purple-500/20 text-purple-700 dark:text-purple-300' },
];

export default function RecyclerDashboard() {
  const { user, isLoading } = useAuth();
  const [transactions, setTransactions] = useState<RecyclingTransaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    materialType: 'plastic' as RecyclingTransaction['materialType'],
    weight: '',
    source: '',
    paymentMethod: 'cash' as 'cash' | 'mpesa',
    mpesaCode: '',
  });

  useEffect(() => {
    if (!user || user.role !== 'recycler') return;
    (async () => {
      const rows = await fetchRecyclerTransactionsDb();
      setTransactions(rows.filter((tx) => String(tx.recyclerId) === String(user.id)));
    })();
  }, [user]);

  if (isLoading || !user) return null;

  const totalWeight = transactions.reduce((sum, t) => sum + t.weight, 0);
  const totalValue = transactions.reduce((sum, t) => sum + t.price, 0);

  const materialStats = materialTypes.map((material) => {
    const materialTransactions = transactions.filter((t) => t.materialType === material.type);
    return {
      ...material,
      weight: materialTransactions.reduce((sum, t) => sum + t.weight, 0),
      totalValue: materialTransactions.reduce((sum, t) => sum + t.price, 0),
    };
  });

  const topMaterial = materialStats.reduce(
    (best, current) => (current.weight > best.weight ? current : best),
    materialStats[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.paymentMethod === 'mpesa' && !formData.mpesaCode.trim()) {
      toast.error('Please enter M-Pesa transaction code');
      return;
    }

    const material = materialTypes.find((m) => m.type === formData.materialType);
    const weight = parseFloat(formData.weight);
    const price = weight * (material?.pricePerKg || 0);

    const newTransaction = await createRecyclerTransactionDb({
      recyclerId: user.id,
      materialType: formData.materialType,
      weight,
      price,
      source: formData.source,
      paymentMethod: formData.paymentMethod,
      mpesaCode: formData.paymentMethod === 'mpesa' ? formData.mpesaCode : undefined,
    });

    setTransactions([...transactions, newTransaction]);
    setFormData({ materialType: 'plastic', weight: '', source: '', paymentMethod: 'cash', mpesaCode: '' });
    setShowForm(false);
    toast.success(`Recorded ${weight}kg of ${material?.name || 'material'} for KES ${price}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Recycler Dashboard</h1>
            <p className="text-muted-foreground">Track your recycling materials and transactions</p>
          </div>
          <Button className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4" />
            Record Transaction
          </Button>
        </div>

        {/* New Transaction Form */}
        {showForm && (
          <div className="dashboard-section animate-fade-in">
            <h2 className="text-lg font-semibold mb-4">New Recycling Transaction</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Material Type</Label>
                  <select
                    value={formData.materialType}
                    onChange={(e) => setFormData({ ...formData, materialType: e.target.value as RecyclingTransaction['materialType'] })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    {materialTypes.map((m) => (
                      <option key={m.type} value={m.type}>
                        {m.name} (KES {m.pricePerKg}/kg)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="25"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input
                    placeholder="Westlands Collection"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as 'cash' | 'mpesa' })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                  </select>
                </div>
                {formData.paymentMethod === 'mpesa' && (
                  <div className="space-y-2">
                    <Label>M-Pesa Code</Label>
                    <Input
                      placeholder="e.g., SHK7X9M2YP"
                      value={formData.mpesaCode}
                      onChange={(e) => setFormData({ ...formData, mpesaCode: e.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit">Save Transaction</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            title="Total Recycled"
            value={`${totalWeight} kg`}
            icon={Scale}
            description="All time"
            iconClassName="bg-success/20 text-success"
          />
          <StatCard
            title="Total Value"
            value={`KES ${totalValue.toLocaleString()}`}
            icon={DollarSign}
            description="Revenue earned"
            iconClassName="bg-accent/20 text-accent"
          />
          <StatCard
            title="Transactions"
            value={transactions.length}
            icon={Package}
            description="This month"
            iconClassName="bg-primary/20 text-primary"
          />
          <StatCard
            title="Top Material"
            value={transactions.length > 0 ? topMaterial?.name || 'N/A' : 'N/A'}
            icon={Recycle}
            description="By weight"
            iconClassName="bg-info/20 text-info"
          />
        </div>

        {/* Material Breakdown */}
        <div className="dashboard-section">
          <h2 className="text-lg font-semibold mb-4">Material Inventory</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {materialStats.map((material) => (
              <div key={material.type} className="p-4 rounded-xl bg-secondary/50 text-center space-y-3">
                <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${material.tone}`}>
                  <material.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">{material.name}</div>
                  <div className="text-sm text-muted-foreground">{material.weight} kg</div>
                </div>
                <div className="text-sm text-muted-foreground">KES {material.totalValue.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="dashboard-section">
          <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>

          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Recycle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No transactions yet</p>
              <Button variant="link" onClick={() => setShowForm(true)}>
                Record your first transaction
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Material</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Weight</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Value</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice().reverse().map((txn) => {
                    const material = materialTypes.find((m) => m.type === txn.materialType);
                    return (
                      <tr key={txn.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="py-3 px-4 text-sm">{new Date(txn.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-sm">{material?.name}</td>
                        <td className="py-3 px-4 text-sm">{txn.weight} kg</td>
                        <td className="py-3 px-4 text-sm font-medium">KES {txn.price.toLocaleString()}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">{txn.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
