import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecyclingTransaction } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { FileText, Plus, ArrowUpRight, ArrowDownLeft, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { fetchRecyclerTransactionsDb } from '@/lib/recyclablesDb';

export default function TransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<RecyclingTransaction[]>([]);
  const [searchMaterial, setSearchMaterial] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const rows = await fetchRecyclerTransactionsDb();
      setTransactions(rows.filter((item) => String(item.recyclerId) === String(user.id)));
    })();
  }, [user]);

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (showSearch) {
      if (searchMaterial) {
        result = result.filter(t => t.materialType.toLowerCase().includes(searchMaterial.toLowerCase()));
      }
      if (dateFrom) {
        result = result.filter(t => t.createdAt.split('T')[0] >= dateFrom);
      }
      if (dateTo) {
        result = result.filter(t => t.createdAt.split('T')[0] <= dateTo);
      }
    }
    return result;
  }, [transactions, searchMaterial, dateFrom, dateTo, showSearch]);

  const totalValue = filteredTransactions.reduce((sum, t) => sum + t.price, 0);
  const totalWeight = filteredTransactions.reduce((sum, t) => sum + t.weight, 0);

  const handleDownload = () => {
    const csvContent = [
      'Date,Material,Source,Weight (kg),Payment,Amount (KES)',
      ...filteredTransactions.map(t => `${new Date(t.createdAt).toLocaleDateString()},${t.materialType},${t.source},${t.weight},${t.paymentMethod},${t.price}`)
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Transactions exported!');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Transactions</h1>
            <p className="text-muted-foreground">View recycling records</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Transaction
          </Button>
        </div>

        {/* Summary - dynamically updates with filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <ArrowDownLeft className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Weight{showSearch ? ' (filtered)' : ''}</p>
                  <p className="text-2xl font-bold text-primary">{totalWeight} kg</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-success/10 to-success/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                  <ArrowUpRight className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Value{showSearch ? ' (filtered)' : ''}</p>
                  <p className="text-2xl font-bold text-success">KES {totalValue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Recent Transactions
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)}>
                  <Search className="w-4 h-4 mr-1" />{showSearch ? 'Hide' : 'Search'}
                </Button>
                {filteredTransactions.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="w-4 h-4 mr-1" />Export
                  </Button>
                )}
              </div>
            </div>
            {showSearch && (
              <div className="flex flex-wrap items-end gap-3 mt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Material</Label>
                  <Input placeholder="e.g. plastic..." value={searchMaterial} onChange={(e) => setSearchMaterial(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSearchMaterial(''); setDateFrom(''); setDateTo(''); }}>Clear</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {filteredTransactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No transactions found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Date</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Material</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Source</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Weight</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Payment</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-border/50">
                        <td className="py-3 px-2 text-sm">{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="capitalize">{tx.materialType}</Badge>
                        </td>
                        <td className="py-3 px-2 text-sm">{tx.source}</td>
                        <td className="py-3 px-2 text-sm">{tx.weight} kg</td>
                        <td className="py-3 px-2">
                          <div className="flex flex-col">
                            <Badge variant={tx.paymentMethod === 'mpesa' ? 'default' : 'secondary'} className="w-fit text-xs">
                              {tx.paymentMethod === 'mpesa' ? '📱 M-Pesa' : '💵 Cash'}
                            </Badge>
                            {tx.paymentMethod === 'mpesa' && tx.mpesaCode && (
                              <span className="text-xs text-muted-foreground mt-1">{tx.mpesaCode}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-sm font-medium text-success">
                          KES {tx.price.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
