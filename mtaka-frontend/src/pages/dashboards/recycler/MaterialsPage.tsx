import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { MaterialInventory, RecyclingTransaction } from '@/lib/store';
import { fetchRecyclerInventoryDb, fetchRecyclerTransactionsDb } from '@/lib/recyclablesDb';
import { Package, TrendingUp, Scale, Calendar, FileText, ArrowUpRight } from 'lucide-react';

const materialInfo: Record<string, { label: string; emoji: string; pricePerKg: number }> = {
  plastic: { label: 'Plastic', emoji: '♳', pricePerKg: 20 },
  paper: { label: 'Paper', emoji: '📄', pricePerKg: 8 },
  metal: { label: 'Metal', emoji: '🔩', pricePerKg: 35 },
  glass: { label: 'Glass', emoji: '🫙', pricePerKg: 5 },
  electronics: { label: 'E-Waste', emoji: '📱', pricePerKg: 50 },
};

const categoryColors: Record<string, string> = {
  plastic: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  paper: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  metal: 'bg-slate-500/20 text-slate-700 dark:text-slate-300',
  glass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  electronics: 'bg-purple-500/20 text-purple-700 dark:text-purple-300',
};

export default function MaterialsPage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<MaterialInventory[]>([]);
  const [transactions, setTransactions] = useState<RecyclingTransaction[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialInventory | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [inv, tx] = await Promise.all([fetchRecyclerInventoryDb(), fetchRecyclerTransactionsDb()]);
      setInventory(inv.filter((item) => String(item.recyclerId) === String(user.id)));
      setTransactions(tx.filter((item) => String(item.recyclerId) === String(user.id)));
    })();
  }, [user]);

  if (!user) return null;

  const totalStock = inventory.reduce((sum, m) => sum + m.stock, 0);
  const totalValue = inventory.reduce((sum, m) => sum + m.totalValue, 0);

  // Get transactions for selected material
  const getTransactionsForMaterial = (materialType: string): RecyclingTransaction[] => {
    return transactions.filter(t => t.materialType === materialType);
  };

  const handleViewDetails = (material: MaterialInventory) => {
    setSelectedMaterial(material);
    setShowDetails(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Materials Inventory</h1>
          <p className="text-muted-foreground">Track recyclable materials in stock</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Package className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Materials</p>
                  <p className="text-2xl font-bold">{inventory.length} types</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                  <Scale className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Stock</p>
                  <p className="text-2xl font-bold">{totalStock.toLocaleString()} kg</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                  <p className="text-2xl font-bold">KES {totalValue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Materials Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Available Materials</CardTitle>
          </CardHeader>
          <CardContent>
            {inventory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No materials in inventory yet</p>
                <p className="text-sm">Complete pickups to add materials to your inventory</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {inventory.map((material) => {
                  const info = materialInfo[material.materialType] || { label: material.materialType, emoji: '📦', pricePerKg: 0 };
                  const avgPrice = material.stock > 0 ? (material.totalValue / material.stock).toFixed(1) : 0;
                  const marketValue = material.stock * info.pricePerKg;
                  const materialTransactions = getTransactionsForMaterial(material.materialType);
                  
                  return (
                    <div
                      key={material.id}
                      className="p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={categoryColors[material.materialType]}>
                          {info.emoji} {info.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {materialTransactions.length} txns
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-primary mb-1">
                        {material.stock.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kg</span>
                      </p>
                      <div className="space-y-1 text-sm text-muted-foreground mb-3">
                        <p>Spent: KES {material.totalValue.toLocaleString()}</p>
                        <p>Avg: KES {avgPrice}/kg</p>
                        <p className="text-success">Market Value: ~KES {marketValue.toLocaleString()}</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-full"
                        onClick={() => handleViewDetails(material)}
                      >
                        View Details
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Material Details Dialog */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedMaterial && (
                  <>
                    <span className="text-2xl">
                      {materialInfo[selectedMaterial.materialType]?.emoji || '📦'}
                    </span>
                    {materialInfo[selectedMaterial.materialType]?.label || selectedMaterial.materialType} Inventory Details
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {selectedMaterial && (
              <div className="space-y-6 pt-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Current Stock</p>
                    <p className="text-2xl font-bold text-primary">{selectedMaterial.stock.toLocaleString()} kg</p>
                  </div>
                  <div className="p-4 bg-success/10 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Spent</p>
                    <p className="text-2xl font-bold text-success">KES {selectedMaterial.totalValue.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-secondary rounded-lg">
                    <p className="text-sm text-muted-foreground">Average Cost</p>
                    <p className="text-xl font-bold">
                      KES {selectedMaterial.stock > 0 
                        ? (selectedMaterial.totalValue / selectedMaterial.stock).toFixed(1) 
                        : 0}/kg
                    </p>
                  </div>
                  <div className="p-4 bg-secondary rounded-lg">
                    <p className="text-sm text-muted-foreground">Market Rate</p>
                    <p className="text-xl font-bold">
                      KES {materialInfo[selectedMaterial.materialType]?.pricePerKg || 0}/kg
                    </p>
                  </div>
                </div>

                {/* Last Updated */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Last updated: {new Date(selectedMaterial.lastUpdated).toLocaleString()}
                </div>

                {/* Transaction History */}
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4" />
                    Recent Transactions
                  </h3>
                  <div className="space-y-2">
                    {getTransactionsForMaterial(selectedMaterial.materialType).slice(-10).reverse().map((txn) => (
                      <div
                        key={txn.id}
                        className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium text-sm">{txn.source}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(txn.createdAt).toLocaleDateString()} • {txn.weight} kg
                          </p>
                          {txn.paymentMethod === 'mpesa' && txn.mpesaCode && (
                            <p className="text-xs text-primary">Mpesa: {txn.mpesaCode}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-success flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3" />
                            KES {txn.price.toLocaleString()}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {txn.paymentMethod === 'mpesa' ? '📱 M-Pesa' : '💵 Cash'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {getTransactionsForMaterial(selectedMaterial.materialType).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No transactions for this material yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
