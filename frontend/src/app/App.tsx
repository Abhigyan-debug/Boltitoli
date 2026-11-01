import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { lazy, type ReactNode, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { LoadingBlock } from "@/components/ui/primitives";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { I18nProvider, useT } from "@/i18n/I18nProvider";
import { ApiError } from "@/lib/api";
import { UpdatePrompt } from "./UpdatePrompt";

const AppShell = lazy(() => import("@/components/layout/AppShell").then((m) => ({ default: m.AppShell })));
const LoginPage = lazy(() => import("@/features/auth/AuthPages").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/features/auth/AuthPages").then((m) => ({ default: m.RegisterPage })));
const Landing = lazy(() => import("@/features/landing/LandingPage"));
const Onboarding = lazy(() => import("@/features/onboarding/OnboardingPage"));
const Overview = lazy(() => import("@/features/dashboard/OverviewPage"));
const Classrooms = lazy(() => import("@/features/classrooms/ClassroomsPage"));
const Groups = lazy(() => import("@/features/groups/GroupsPage"));
const GroupDetail = lazy(() => import("@/features/groups/GroupDetailPage"));
const Lessons = lazy(() => import("@/features/lessons/LessonsPage"));
const LessonDetail = lazy(() => import("@/features/lessons/LessonDetailPage"));
const Sessions = lazy(() => import("@/features/sessions/SessionsPage"));
const NewSession = lazy(() => import("@/features/sessions/NewSessionPage"));
const LiveSession = lazy(() => import("@/features/sessions/live/LiveSessionPage"));
const OfflineSession = lazy(() => import("@/features/sessions/live/OfflineSessionPage"));
const SummaryPage = lazy(() => import("@/features/sessions/SummaryPage"));
const Progress = lazy(() => import("@/features/analytics/ProgressPage"));
const Reports = lazy(() => import("@/features/reports/ReportsPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => !(e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) && n < 2,
      refetchOnWindowFocus: false,
    },
    // Local IndexedDB writes (offline sessions) must run without a network.
    mutations: { networkMode: "always" },
  },
});

function Protected({ children, allowOffline = false, staffOnly = false }: { children: ReactNode; allowOffline?: boolean; staffOnly?: boolean }) {
  const { status, user } = useAuth();
  const loc = useLocation();
  if (status === "loading") return <LoadingBlock label="Checking your login" />;
  if (status === "anonymous") return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (status === "offline_cached" && !allowOffline) return <Navigate to="/app/lessons" replace />;
  if (staffOnly && user?.role === "official") return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "authenticated" || status === "offline_cached")
    return <Navigate to={user && !user.onboarding_completed && user.role !== "official" ? "/onboarding" : "/app"} replace />;
  return <>{children}</>;
}

const Page = ({ children }: { children: ReactNode }) => <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* every framer-motion animation honours the device's "reduce motion" setting */}
      <MotionConfig reducedMotion="user">
      <I18nProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Page><Landing /></Page>} />
            <Route path="/login" element={<PublicOnly><Page><LoginPage /></Page></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Page><RegisterPage /></Page></PublicOnly>} />
            <Route path="/onboarding" element={<Protected staffOnly><Page><Onboarding /></Page></Protected>} />
            <Route path="/session/:id" element={<Protected staffOnly><Page><LiveSession /></Page></Protected>} />
            <Route path="/session/offline/:id" element={<Protected allowOffline staffOnly><Page><OfflineSession /></Page></Protected>} />
            <Route path="/app" element={<Protected allowOffline><Page><AppShell /></Page></Protected>}>
              <Route index element={<Page><Overview /></Page>} />
              <Route path="classrooms" element={<Page><Classrooms /></Page>} />
              <Route path="groups" element={<Page><Groups /></Page>} />
              <Route path="groups/:id" element={<Page><GroupDetail /></Page>} />
              <Route path="lessons" element={<Page><Lessons /></Page>} />
              <Route path="lessons/:id" element={<Page><LessonDetail /></Page>} />
              <Route path="sessions" element={<Page><Sessions /></Page>} />
              <Route path="sessions/new" element={<Page><NewSession /></Page>} />
              <Route path="sessions/:id/summary" element={<Page><SummaryPage /></Page>} />
              <Route path="progress" element={<Page><Progress /></Page>} />
              <Route path="reports" element={<Page><Reports /></Page>} />
              <Route path="settings" element={<Page><SettingsPage /></Page>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster position="bottom-center" toastOptions={{ className: "font-sans" }} />
          <UpdatePrompt />
        </AuthProvider>
      </BrowserRouter>
      </I18nProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

function NotFound() {
  const t = useT();
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-chalk text-5xl text-slate-800">?</p>
        <h1 className="mt-2 text-2xl font-bold">{t("This page doesn’t exist")}</h1>
        <a className="mt-4 inline-block text-teal-700 underline" href="/app">{t("Go to the dashboard")}</a>
      </div>
    </div>
  );
}
