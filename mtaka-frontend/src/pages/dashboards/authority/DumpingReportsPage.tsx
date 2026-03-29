import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { DumpingReport } from '@/lib/store';
import { deleteDumpingReportDb, fetchDumpingReportsDb, updateDumpingReportDb } from '@/lib/dumpingReportsDb';
import { MapPin, Clock, CheckCircle, AlertTriangle, Eye, Phone, Filter, Image, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const statusColors: Record<DumpingReport['status'], string> = {
  reported: 'bg-warning/20 text-warning',
  investigating: 'bg-info/20 text-info',
  resolved: 'bg-success/20 text-success',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function DumpingReportsPage() {
  const [reports, setReports] = useState<DumpingReport[]>([]);
  const [viewDialog, setViewDialog] = useState<{ open: boolean; report: DumpingReport | null }>({ open: false, report: null });
  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; reportId: string }>({ open: false, reportId: '' });
  const [resolutionMessage, setResolutionMessage] = useState('');
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [reportDateRange, setReportDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  
  const refreshReports = async () => {
    const rows = await fetchDumpingReportsDb();
    setReports(rows);
  };

  useEffect(() => {
    refreshReports().catch(() => {
      toast.error('Failed to load reports');
    });
  }, []);

  const handleUpdateStatus = async (id: string, status: DumpingReport['status']) => {
    await updateDumpingReportDb(id, { status });
    await refreshReports();
    toast.success(`Report marked as ${status}`);
  };

  const handleResolve = async () => {
    if (!resolutionMessage.trim()) {
      toast.error('Please enter a resolution note');
      return;
    }
    await updateDumpingReportDb(resolveDialog.reportId, { 
      status: 'resolved', 
      resolutionNotes: resolutionMessage,
      resolutionMessage: resolutionMessage,
    });
    await refreshReports();
    setResolveDialog({ open: false, reportId: '' });
    setResolutionMessage('');
    toast.success('Report resolved with note sent to resident');
  };

  const handleDeleteCancelled = async (id: string) => {
    if (confirm('Are you sure you want to permanently delete this cancelled report?')) {
      await deleteDumpingReportDb(id);
      await refreshReports();
      toast.success('Report permanently deleted');
    }
  };

  const getEvidenceSrc = (report: DumpingReport) => report.imageData || report.imageUrl || '';

  const toDataUrl = async (src: string): Promise<string> => {
    if (!src) return '';
    if (src.startsWith('data:')) return src;
    try {
      const response = await fetch(src, { credentials: 'include' });
      if (!response.ok) return src;
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read evidence image'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return src;
    }
  };

  const handleDownloadReport = async (report: DumpingReport) => {
    const evidenceSrc = getEvidenceSrc(report);
    const embeddedEvidence = evidenceSrc ? await toDataUrl(evidenceSrc) : '';
    const safe = (value: string) =>
      value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Illegal Dumping Report ${safe(report.id)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; color: #111; margin: 0; }
      .sheet { width: 100%; max-width: 180mm; margin: 0 auto; }
      h1 { font-size: 20px; margin: 0 0 10px; }
      .meta { margin: 8px 0 14px; border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
      .row { margin: 4px 0; font-size: 13px; }
      .label { font-weight: 700; }
      .block { margin-top: 12px; }
      .text { white-space: pre-wrap; border: 1px solid #ddd; border-radius: 8px; padding: 10px; font-size: 13px; }
      .img-wrap { margin-top: 12px; border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
      .img-wrap img { width: 100%; max-height: 70vh; object-fit: contain; display: block; border-radius: 4px; }
      .muted { color: #666; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <h1>Illegal Dumping Report</h1>
      <div class="meta">
        <div class="row"><span class="label">Date Reported:</span> ${safe(new Date(report.createdAt).toLocaleString())}</div>
        <div class="row"><span class="label">Reporter:</span> ${safe(report.userName)}</div>
        <div class="row"><span class="label">Phone:</span> ${safe(report.userPhone || 'N/A')}</div>
        <div class="row"><span class="label">Location:</span> ${safe(report.location)}</div>
        <div class="row"><span class="label">Coordinates:</span> ${safe(`${report.coordinates.lat.toFixed(4)}, ${report.coordinates.lng.toFixed(4)}`)}</div>
        <div class="row"><span class="label">Status:</span> ${safe(report.status)}</div>
      </div>

      <div class="block">
        <div class="label">Description/Message</div>
        <div class="text">${safe(report.description || '')}</div>
      </div>

      ${
        report.resolutionMessage
          ? `<div class="block">
              <div class="label">Resolution Note</div>
              <div class="text">${safe(report.resolutionMessage)}</div>
            </div>`
          : ''
      }

      ${
        embeddedEvidence
          ? `<div class="img-wrap">
              <div class="label">Photo Evidence</div>
              <div class="muted">Attached in this same page.</div>
              <img src="${embeddedEvidence}" alt="Photo evidence" />
            </div>`
          : ''
      }
    </div>
  </body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dumping-report-${report.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded (single page with attached evidence)');
  };

  // Filter reports by standardized weekly/monthly range
  const filteredReports = reports.filter(r => {
    if (!reportDateRange) return true;
    const reportDate = new Date(r.createdAt);
    return reportDate >= reportDateRange.from && reportDate <= reportDateRange.to;
  });

  const pendingCount = filteredReports.filter(r => r.status === 'reported').length;
  const investigatingCount = filteredReports.filter(r => r.status === 'investigating').length;
  const resolvedCount = filteredReports.filter(r => r.status === 'resolved').length;
  const cancelledCount = filteredReports.filter(r => r.status === 'cancelled').length;

  const getReporterPhone = (report: DumpingReport) => {
    if (report.userPhone) return report.userPhone;
    return '';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dumping Reports</h1>
            <p className="text-muted-foreground">Monitor and manage illegal dumping reports</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilter(!showFilter)}>
            <Filter className="w-4 h-4 mr-1" />{showFilter ? 'Hide Filter' : 'Filter by Date'}
          </Button>
        </div>

        {showFilter && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex gap-1 bg-secondary rounded-lg p-1 w-fit">
                  <Button size="sm" variant={viewMode === 'weekly' ? 'default' : 'ghost'} onClick={() => setViewMode('weekly')}>
                    Weekly
                  </Button>
                  <Button size="sm" variant={viewMode === 'monthly' ? 'default' : 'ghost'} onClick={() => setViewMode('monthly')}>
                    Monthly
                  </Button>
                </div>
                <DateRangeFilter viewMode={viewMode} onDateRangeChange={(from, to) => setReportDateRange({ from, to })} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="border-warning/30">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-warning" /></div>
                <div><p className="text-xs sm:text-sm text-muted-foreground">Pending</p><p className="text-xl sm:text-2xl font-bold">{pendingCount}</p></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-info/30">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-info/20 flex items-center justify-center flex-shrink-0"><Eye className="w-5 h-5 sm:w-6 sm:h-6 text-info" /></div>
                <div><p className="text-xs sm:text-sm text-muted-foreground">Investigating</p><p className="text-xl sm:text-2xl font-bold">{investigatingCount}</p></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-success/30">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0"><CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-success" /></div>
                <div><p className="text-xs sm:text-sm text-muted-foreground">Resolved</p><p className="text-xl sm:text-2xl font-bold">{resolvedCount}</p></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center text-center gap-3 sm:flex-row sm:items-center sm:text-left sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><Trash2 className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" /></div>
                <div><p className="text-xs sm:text-sm text-muted-foreground">Cancelled</p><p className="text-xl sm:text-2xl font-bold">{cancelledCount}</p></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reports List */}
        <Card>
          <CardHeader><CardTitle>All Reports</CardTitle></CardHeader>
          <CardContent>
            {filteredReports.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No reports found</p>
            ) : (
              <div className="space-y-4">
                {filteredReports.map((report) => {
                  const phone = getReporterPhone(report);
                  let contextualActionButton = null;

                  if (report.status === 'reported') {
                    contextualActionButton = (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full justify-center sm:w-auto"
                        onClick={() => handleUpdateStatus(report.id, 'investigating')}
                      >
                        Investigate
                      </Button>
                    );
                  } else if (report.status === 'investigating') {
                    contextualActionButton = (
                      <Button
                        size="sm"
                        className="w-full justify-center sm:w-auto"
                        onClick={() => {
                          setResolveDialog({ open: true, reportId: report.id });
                          setResolutionMessage('');
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />Resolve
                      </Button>
                    );
                  } else if (report.status === 'cancelled') {
                    contextualActionButton = (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full justify-center sm:w-auto"
                        onClick={() => handleDeleteCancelled(report.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />Delete
                      </Button>
                    );
                  }

                  return (
                    <div key={report.id} className="p-4 rounded-lg border border-border bg-card">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={statusColors[report.status]}>{report.status}</Badge>
                            <span className="text-sm text-muted-foreground">by {report.userName}</span>
                          </div>
                          <p className="text-sm mb-2">{report.description}</p>
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{report.location}</span>
                            <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{new Date(report.createdAt).toLocaleDateString()}</span>
                            {phone && (
                              <a href={`tel:${phone}`} className="flex items-center gap-1 text-primary hover:underline">
                                <Phone className="w-4 h-4" />{phone}
                              </a>
                            )}
                          </div>
                          {getEvidenceSrc(report) && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-info">
                              <Image className="w-3 h-3" />Photo evidence attached
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full justify-center sm:w-auto"
                            onClick={() => setViewDialog({ open: true, report })}
                          >
                            <Eye className="w-4 h-4 mr-1" />Details
                          </Button>
                          {contextualActionButton}
                          <Button
                            size="sm"
                            variant="outline"
                            className={`w-full justify-center sm:w-auto ${contextualActionButton ? 'col-span-2' : ''}`}
                            onClick={() => handleDownloadReport(report)}
                          >
                            <Download className="w-4 h-4 mr-1" />Download
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* View Details Dialog */}
      <Dialog open={viewDialog.open} onOpenChange={(open) => setViewDialog({ open, report: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Report Details</DialogTitle></DialogHeader>
          {viewDialog.report && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><p className="text-sm text-muted-foreground">Reporter</p><p className="font-medium">{viewDialog.report.userName}</p></div>
                <div><p className="text-sm text-muted-foreground">Status</p><Badge className={statusColors[viewDialog.report.status]}>{viewDialog.report.status}</Badge></div>
                <div><p className="text-sm text-muted-foreground">Phone</p>
                  {(() => {
                    const phone = getReporterPhone(viewDialog.report);
                    return phone ? <a href={`tel:${phone}`} className="text-primary underline">{phone}</a> : <span>N/A</span>;
                  })()}
                </div>
                <div><p className="text-sm text-muted-foreground">Date</p><p className="font-medium">{new Date(viewDialog.report.createdAt).toLocaleString()}</p></div>
              </div>
              <div><p className="text-sm text-muted-foreground">Location</p><p className="font-medium">{viewDialog.report.location}</p></div>
              <div><p className="text-sm text-muted-foreground">Coordinates</p><p className="text-sm">📍 {viewDialog.report.coordinates.lat.toFixed(4)}, {viewDialog.report.coordinates.lng.toFixed(4)}</p></div>
              <div><p className="text-sm text-muted-foreground">Description</p><p>{viewDialog.report.description}</p></div>
              {getEvidenceSrc(viewDialog.report) && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Photo Evidence</p>
                  <img
                    src={getEvidenceSrc(viewDialog.report)}
                    alt="Evidence"
                    className="w-full rounded-lg border border-border max-h-64 object-contain bg-black/5"
                    onError={(event) => {
                      const img = event.currentTarget;
                      if (img.dataset.fallbackApplied === '1') return;
                      img.dataset.fallbackApplied = '1';
                      const src = img.getAttribute('src') || '';
                      if (src.includes('/dumping_reports/') && !src.includes('/media/dumping_reports/')) {
                        img.src = src.replace('/dumping_reports/', '/media/dumping_reports/');
                      }
                    }}
                  />
                  <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => handleDownloadReport(viewDialog.report!)}>
                    <Download className="w-4 h-4" />Download Report
                  </Button>
                </div>
              )}
              {viewDialog.report.resolutionMessage && (
                <div className="p-3 rounded-lg bg-success/10">
                  <p className="text-sm text-muted-foreground">Resolution Note</p>
                  <p className="text-success">{viewDialog.report.resolutionMessage}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialog.open} onOpenChange={(open) => { setResolveDialog({ open, reportId: '' }); setResolutionMessage(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Report</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-muted-foreground text-sm">Enter a resolution note or appreciation message. This will be visible to the resident who submitted the report.</p>
            <div className="space-y-2">
              <Label>Resolution Note / Appreciation *</Label>
              <Textarea
                placeholder="e.g., Thank you for reporting. The area has been cleaned up by our team..."
                value={resolutionMessage}
                onChange={(e) => setResolutionMessage(e.target.value)}
                rows={4}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveDialog({ open: false, reportId: '' }); setResolutionMessage(''); }}>Cancel</Button>
            <Button onClick={handleResolve} disabled={!resolutionMessage.trim()}>
              <CheckCircle className="w-4 h-4 mr-1" />Resolve & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
