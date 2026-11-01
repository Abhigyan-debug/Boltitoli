import * as DM from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  CloudOff,
  FileDown,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  RefreshCw,
  School2,
  Settings,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useT } from "@/i18n/I18nProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { closeOrphanSessions, syncPending } from "@/features/offline/sync";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { type SyncState, useSyncState } from "@/hooks/useOnline";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/app/classrooms", label: "Classrooms", icon: School2 },
  { to: "/app/groups", label: "Learning groups", icon: Users },
  { to: "/app/lessons", label: "Lessons", icon: BookOpen },
  { to: "/app/sessions", label: "Sessions", icon: History },
  { to: "/app/progress", label: "Progress", icon: BarChart3 },
  { to: "/app/reports", label: "Reports", icon: FileDown },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const OFFICIAL_NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/app/progress", label: "Progress", icon: BarChart3 },
  { to: "/app/reports", label: "Reports", icon: FileDown },
];

function SideNav({ onNavigate, pillId }: { onNavigate?: () => void; pillId: string }) {
  const { user } = useAuth();
  const items = user?.role === "official" ? OFFICIAL_NAV : NAV;
  const t = useT();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 px-3">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 h-11 text-[15px] font-medium transition-colors",
              isActive ? "text-slate-800 font-semibold" : "text-chalk/80 hover:bg-chalk/10 hover:text-chalk",
            )
          }
        >
          {({ isActive }) => (
            <>
              {/* one pill shared by all items (layoutId), so it slides to the page you open */}
              {isActive && (
                <motion.span layoutId={pillId} aria-hidden transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-[var(--radius-md)] bg-sky-100 shadow-[0_6px_16px_-8px_rgb(63_212_255/0.6)]" />
              )}
              <Icon className={cn("relative size-[18px]", isActive && "text-teal-700")} aria-hidden />
              <span className="relative">{t(label)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function initialsOf(name: string) {
  // First grapheme of each name part, so Devanagari letters with matras stay intact.
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("hi", { granularity: "grapheme" }) : null;
  const first = (w: string) => (seg ? [...seg.segment(w)][0]?.segment ?? "" : w[0] ?? "");
  return name.split(/\s+/).filter(Boolean).map(first).slice(0, 2).join("").toUpperCase();
}

/** Who is signed in, at the foot of the sidebar. */
function SidebarUser() {
  const { user } = useAuth();
  const t = useT();
  if (!user) return null;
  return (
    <div className="mx-3 flex items-center gap-3 rounded-[var(--radius-lg)] border border-white/10 bg-white/[0.06] p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-saffron-500),#f2b631)] text-[14px] font-bold text-slate-900 shadow-[0_4px_12px_-4px_rgb(242_138_30/0.7)]">
        {initialsOf(user.full_name)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14px] font-semibold text-chalk">{user.full_name}</span>
        <span className="block truncate text-[12px] capitalize text-chalk/65">{t(user.role.replace("_", " "))}</span>
      </span>
    </div>
  );
}

const SYNC_LABEL: Record<SyncState, { text: string; tone: string; icon: ReactNode }> = {
  online: { text: "Online", tone: "text-success-700 bg-success-100", icon: <Wifi className="size-4" /> },
  offline: { text: "Offline", tone: "text-warning-700 bg-warning-100", icon: <CloudOff className="size-4" /> },
  syncing: { text: "Syncing", tone: "text-teal-800 bg-teal-50", icon: <RefreshCw className="size-4 animate-spin" /> },
  pending: { text: "Waiting to sync", tone: "text-warning-700 bg-warning-100", icon: <RefreshCw className="size-4" /> },
  sync_failed: { text: "Sync failed", tone: "text-danger-700 bg-danger-100", icon: <RefreshCw className="size-4" /> },
};

export function ConnectivityPill() {
  const { user } = useAuth();
  const { state, pending } = useSyncState();
  const waiting = pending.filter((p) => p.status !== "in_progress").length;
  const s = SYNC_LABEL[state];
  const t = useT();
  const canSync = (state === "pending" || state === "sync_failed") && waiting > 0;
  return (
    <button
      type="button"
      disabled={!canSync}
      onClick={() => void syncPending(user?.school_id)}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[13px] font-semibold", s.tone,
        canSync && "hover:brightness-95 cursor-pointer")}
      aria-live="polite"
      title={canSync ? t("Upload sessions recorded offline") : undefined}
    >
      {s.icon}
      {t(s.text)}
      {waiting > 0 && <span className="tabular">({waiting})</span>}
    </button>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const t = useT();
  if (!user) return null;
  const initials = initialsOf(user.full_name);
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 h-10 hover:bg-chalk-dim" title={t("Account menu")}>
          <span className="grid size-8 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-saffron-500),#f2b631)] text-[13px] font-bold text-slate-900">{initials}</span>
          <span className="hidden md:block text-left leading-tight">
            <span className="block text-sm font-semibold">{user.full_name}</span>
            <span className="block text-xs text-ink-muted capitalize">{t(user.role.replace("_", " "))}</span>
          </span>
          <ChevronDown className="size-4 text-ink-muted" aria-hidden />
        </button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={6}
          className="z-50 min-w-52 rounded-[var(--radius-md)] border border-line bg-card p-1 shadow-[var(--shadow-lift)]">
          <DM.Item onSelect={() => nav("/app/settings")}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none data-[highlighted]:bg-chalk-dim cursor-pointer">
            <Settings className="size-4" /> {t("Account settings")}
          </DM.Item>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item onSelect={() => void logout().then(() => nav("/login"))}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none data-[highlighted]:bg-chalk-dim cursor-pointer">
            <LogOut className="size-4" /> {t("Log out")}
          </DM.Item>
          <DM.Item onSelect={() => void logout({ clearDevice: true }).then(() => nav("/login"))}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm outline-none data-[highlighted]:bg-chalk-dim cursor-pointer">
            <LogOut className="size-4" /> {t("Log out and clear this device")}
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function AppShell() {
  const { user, status } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const reduce = useReducedMotion();
  const t = useT();
  useEffect(() => setOpen(false), [loc.pathname]);

  // Upload any offline sessions as soon as we are online and logged in.
  useEffect(() => {
    if (status !== "authenticated") return;
    const run = () => void syncPending(user?.school_id).then(() => closeOrphanSessions()).catch(() => {});
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [status, user?.school_id]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:m-2 focus:rounded focus:bg-card focus:p-2">
        {t("Skip to content")}
      </a>
      <aside className="hidden lg:flex lg:flex-col slate-surface sticky top-0 h-dvh overflow-hidden py-5">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 size-56 rounded-full bg-[#3fd4ff]/15 blur-3xl" />
        <Link to="/app" className="relative px-6 mb-7">
          <Logo onSlate />
        </Link>
        <SideNav pillId="nav-pill" />
        <div className="mt-auto space-y-3">
          <p className="px-6 text-[12px] leading-snug text-chalk/55">{user?.school?.name}</p>
          <SidebarUser />
        </div>
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] slate-surface py-5 lg:hidden"
              initial={reduce ? false : { x: -300 }} animate={{ x: 0 }} exit={reduce ? undefined : { x: -300 }}
              transition={{ type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              role="dialog" aria-label={t("Navigation")}
            >
              <div className="flex items-center justify-between px-5 mb-6">
                <Logo onSlate />
                <Button variant="chalk" size="icon" onClick={() => setOpen(false)} aria-label={t("Close menu")}><X /></Button>
              </div>
              <SideNav pillId="nav-pill-mobile" onNavigate={() => setOpen(false)} />
              <div className="mt-6 px-5"><LanguageToggle onSlate /></div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/70 bg-chalk/80 backdrop-blur-xl px-4 sm:px-6 h-16">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t("Open menu")}>
            <Menu />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.school?.name}</p>
            {user?.school?.district && <p className="truncate text-xs text-ink-muted">{user.school.district}</p>}
          </div>
          <LanguageToggle className="hidden sm:inline-flex" />
          <ConnectivityPill />
          <AccountMenu />
        </header>
        {user?.school?.is_demo && (
          <div className="bg-saffron-100 border-b border-[#f3d3a9] px-4 sm:px-6 py-2 text-[13px] text-[#7a4508]">
            <strong>{t("Demo school.")}</strong> {t("The sessions here are simulated by running the lesson engine with scripted answers. They are not real classroom results.")}
          </div>
        )}
        {status === "offline_cached" && (
          <div className="bg-warning-100 border-b border-[#f1dca8] px-4 sm:px-6 py-2 text-[13px] text-warning-700">
            {t("You are offline. Downloaded lessons can still be run; everything else will load when you reconnect.")}
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 py-6 sm:py-8">
          {/* keyed by path so each page fades up as you navigate */}
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
