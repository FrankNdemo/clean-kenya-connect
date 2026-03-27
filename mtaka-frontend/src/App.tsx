import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { isStandaloneAppMode } from "@/lib/appMode";
import { UserRole } from "@/lib/store";
import { getDashboardPathForUser } from "@/lib/dashboardPaths";
import { Recycle } from "lucide-react";

// Pages
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AboutPage from "./pages/AboutPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";

// Dashboards
import ResidentDashboard from "./pages/dashboards/ResidentDashboard";
import CollectorDashboard from "./pages/dashboards/CollectorDashboard";
import RecyclerDashboard from "./pages/dashboards/RecyclerDashboard";
import AuthorityDashboard from "./pages/dashboards/AuthorityDashboard";
import SuperuserDashboard from "./pages/dashboards/SuperuserDashboard";
import SuperuserUsersPage from "./pages/dashboards/superuser/UsersPage";
import SuperuserStatsPage from "./pages/dashboards/superuser/StatsPage";

// Resident Sub-pages
import RewardsPage from "./pages/dashboards/resident/RewardsPage";
import ListRecyclablesPage from "./pages/dashboards/resident/ListRecyclablesPage";
import MyPickupsPage from "./pages/dashboards/resident/MyPickupsPage";
import MyReportsPage from "./pages/dashboards/resident/MyReportsPage";

// Collector Sub-pages
import RequestsPage from "./pages/dashboards/collector/RequestsPage";
import RoutesPage from "./pages/dashboards/collector/RoutesPage";
import CollectorTransactionsPage from "./pages/dashboards/collector/TransactionsPage";
import CollectorReportsPage from "./pages/dashboards/collector/ReportsPage";

// Recycler Sub-pages
import MaterialsPage from "./pages/dashboards/recycler/MaterialsPage";
import AvailableMaterialsPage from "./pages/dashboards/recycler/AvailableMaterialsPage";
import TransactionsPage from "./pages/dashboards/recycler/TransactionsPage";
import AnalyticsPage from "./pages/dashboards/recycler/AnalyticsPage";

// Authority Sub-pages
import StatsPage from "./pages/dashboards/authority/StatsPage";
import DumpingReportsPage from "./pages/dashboards/authority/DumpingReportsPage";
import EventsManagePage from "./pages/dashboards/authority/EventsManagePage";
import UsersPage from "./pages/dashboards/authority/UsersPage";

// Waste Pages
import SchedulePickupPage from "./pages/waste/SchedulePickupPage";
import ReportDumpingPage from "./pages/waste/ReportDumpingPage";

// Event Pages
import EventsPage from "./pages/events/EventsPage";
import CreateEventPage from "./pages/events/CreateEventPage";
import MyEventsPage from "./pages/events/MyEventsPage";

const queryClient = new QueryClient();

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Recycle className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Loading M-Taka...</span>
      </div>
    </div>
  );
}

function RootRoute() {
  const { user, isLoading } = useAuth();

  if (!isStandaloneAppMode()) {
    return <LandingPage />;
  }

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (user) {
    return <Navigate to={getDashboardPathForUser(user)} replace />;
  }

  return <Navigate to="/login" replace />;
}

function MarketingRoute({ element }: { element: JSX.Element }) {
  const { user, isLoading } = useAuth();

  if (!isStandaloneAppMode()) {
    return element;
  }

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (user) {
    return <Navigate to={getDashboardPathForUser(user)} replace />;
  }

  return <Navigate to="/login" replace />;
}

function ProtectedRoute({
  element,
  allowedRoles,
  requireSuperuser = false,
}: {
  element: JSX.Element;
  allowedRoles?: UserRole[];
  requireSuperuser?: boolean;
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPathForUser(user)} replace />;
  }

  if (requireSuperuser && !user.isSuperuser) {
    return <Navigate to={getDashboardPathForUser(user)} replace />;
  }

  return element;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/about" element={<MarketingRoute element={<AboutPage />} />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId" element={<EventsPage />} />
            <Route path="/events/create" element={<ProtectedRoute element={<CreateEventPage />} />} />
            <Route path="/events/my-events" element={<ProtectedRoute element={<MyEventsPage />} />} />

            {/* Dashboard Routes */}
            <Route path="/dashboard/resident" element={<ProtectedRoute element={<ResidentDashboard />} allowedRoles={["resident"]} />} />
            <Route path="/dashboard/resident/rewards" element={<ProtectedRoute element={<RewardsPage />} allowedRoles={["resident"]} />} />
            <Route path="/dashboard/resident/recyclables" element={<ProtectedRoute element={<ListRecyclablesPage />} allowedRoles={["resident"]} />} />
            <Route path="/dashboard/resident/pickups" element={<ProtectedRoute element={<MyPickupsPage />} allowedRoles={["resident"]} />} />
            <Route path="/dashboard/resident/reports" element={<ProtectedRoute element={<MyReportsPage />} allowedRoles={["resident"]} />} />
            
            <Route path="/dashboard/collector" element={<ProtectedRoute element={<CollectorDashboard />} allowedRoles={["collector"]} />} />
            <Route path="/dashboard/collector/requests" element={<ProtectedRoute element={<RequestsPage />} allowedRoles={["collector"]} />} />
            <Route path="/dashboard/collector/routes" element={<ProtectedRoute element={<RoutesPage />} allowedRoles={["collector"]} />} />
            <Route path="/dashboard/collector/transactions" element={<ProtectedRoute element={<CollectorTransactionsPage />} allowedRoles={["collector"]} />} />
            <Route path="/dashboard/collector/reports" element={<ProtectedRoute element={<CollectorReportsPage />} allowedRoles={["collector"]} />} />
            
            <Route path="/dashboard/recycler" element={<ProtectedRoute element={<RecyclerDashboard />} allowedRoles={["recycler"]} />} />
            <Route path="/dashboard/recycler/materials" element={<ProtectedRoute element={<MaterialsPage />} allowedRoles={["recycler"]} />} />
            <Route path="/dashboard/recycler/available" element={<ProtectedRoute element={<AvailableMaterialsPage />} allowedRoles={["recycler"]} />} />
            <Route path="/dashboard/recycler/transactions" element={<ProtectedRoute element={<TransactionsPage />} allowedRoles={["recycler"]} />} />
            <Route path="/dashboard/recycler/analytics" element={<ProtectedRoute element={<AnalyticsPage />} allowedRoles={["recycler"]} />} />
            
            <Route path="/dashboard/authority" element={<ProtectedRoute element={<AuthorityDashboard />} allowedRoles={["authority"]} />} />
            <Route path="/dashboard/authority/stats" element={<ProtectedRoute element={<StatsPage />} allowedRoles={["authority"]} />} />
            <Route path="/dashboard/authority/reports" element={<ProtectedRoute element={<DumpingReportsPage />} allowedRoles={["authority"]} />} />
            <Route path="/dashboard/authority/events" element={<ProtectedRoute element={<EventsManagePage />} allowedRoles={["authority"]} />} />
            <Route path="/dashboard/authority/users" element={<ProtectedRoute element={<UsersPage />} allowedRoles={["authority"]} />} />

            <Route path="/dashboard/superuser" element={<ProtectedRoute element={<SuperuserDashboard />} allowedRoles={["authority"]} requireSuperuser />} />
            <Route path="/dashboard/superuser/stats" element={<ProtectedRoute element={<SuperuserStatsPage />} allowedRoles={["authority"]} requireSuperuser />} />
            <Route path="/dashboard/superuser/users" element={<ProtectedRoute element={<SuperuserUsersPage />} allowedRoles={["authority"]} requireSuperuser />} />
            <Route path="/dashboard/superuser/events" element={<ProtectedRoute element={<Navigate to="/dashboard/superuser" replace />} allowedRoles={["authority"]} requireSuperuser />} />
            <Route path="/dashboard/superuser/reports" element={<ProtectedRoute element={<Navigate to="/dashboard/superuser/stats" replace />} allowedRoles={["authority"]} requireSuperuser />} />

            {/* Waste Management Routes */}
            <Route path="/waste/schedule" element={<ProtectedRoute element={<SchedulePickupPage />} allowedRoles={["resident"]} />} />
            <Route path="/waste/report" element={<ProtectedRoute element={<ReportDumpingPage />} allowedRoles={["resident"]} />} />

            {/* Profile */}
            <Route path="/profile" element={<ProtectedRoute element={<ProfilePage />} />} />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
