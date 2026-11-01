import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Logo } from "@/components/brand/Logo";
import { SpeakerBadge2D } from "@/components/illustrations/Cartoons";
import { Button } from "@/components/ui/button";
import { Field, Input, Notice } from "@/components/ui/primitives";
import { ApiError, errorMessage } from "@/lib/api";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useT } from "@/i18n/I18nProvider";
import { useAuth } from "./AuthProvider";

function AuthLayout({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  const t = useT();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="slate-surface relative isolate hidden overflow-hidden lg:flex flex-col justify-between p-10">
        <div aria-hidden className="pointer-events-none absolute -left-20 top-1/4 -z-10 size-96 rounded-full bg-[#3fd4ff]/20 blur-[90px] animate-[bt-drift_14s_ease-in-out_infinite]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-0 -z-10 size-80 rounded-full bg-saffron-500/20 blur-[90px] animate-[bt-drift_18s_ease-in-out_infinite_reverse]" />
        <Link to="/"><Logo onSlate /></Link>
        <div aria-hidden className="relative mx-auto my-6 grid h-56 w-full max-w-sm place-items-center">
          <SpeakerBadge2D state="speaking" className="scale-[1.9] animate-[bt-float_4s_ease-in-out_infinite]" />
          {[["3", "left-4 top-6 bg-saffron-100 text-saffron-700", "0s"], ["+", "right-8 top-2 bg-sky-100 text-sky-600", "0.9s"], ["2", "left-12 bottom-2 bg-teal-100 text-teal-700", "1.8s"], ["5", "right-4 bottom-8 bg-success-100 text-success-700", "1.2s"]].map(([n, pos, d]) => (
            <span key={n} style={{ animationDelay: d }} className={`tile-3d absolute size-12 text-xl font-extrabold animate-[bt-float_3.6s_ease-in-out_infinite] ${pos}`}>{n}</span>
          ))}
        </div>
        <div>
          <p className="font-chalk text-[34px] leading-snug text-chalk/95" lang="hi">
            एक आवाज़ एक टोली के साथ,
            <br />
            आप दूसरी टोली के साथ।
          </p>
          <p className="mt-4 max-w-sm text-chalk/70">
            {t("BoltiToli runs a 15-minute guided maths practice for one group while you teach another.")}
          </p>
        </div>
        <p className="text-[13px] text-chalk/50">{t("No children’s names or voice recordings are stored.")}</p>
      </div>
      <div className="relative flex min-h-dvh items-start lg:items-center justify-center px-5 py-10">
        <LanguageToggle className="absolute right-4 top-4" />
        <motion.div className="w-full max-w-md" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <Link to="/" className="lg:hidden mb-8 inline-block"><Logo /></Link>
          <div className="rounded-[24px] border border-line bg-card p-6 shadow-[var(--shadow-lift)] sm:p-8">
            <h1 className="text-[28px] font-extrabold tracking-[-0.015em]">{title}</h1>
            <p className="mt-1 mb-7 text-ink-muted">{sub}</p>
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export function LoginPage() {
  const { login, loginDemo } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const t = useT();

  const after = (u: { onboarding_completed: boolean; role: string }) =>
    nav(!u.onboarding_completed && u.role !== "official" ? "/onboarding" : loc.state?.from ?? "/app", { replace: true });

  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      after(await login(v.email, v.password));
    } catch (e) {
      setError(e instanceof ApiError && e.code === "rate_limited" ? t("Too many attempts. Wait a minute and try again.") : errorMessage(e));
    }
  });

  return (
    <AuthLayout title={t("Log in")} sub={t("Welcome back. Your groups and lessons are waiting.")}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label={t("Email")} error={f.formState.errors.email?.message && t(f.formState.errors.email.message)}>
          {(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d}
            aria-invalid={!!f.formState.errors.email} {...f.register("email")} />}
        </Field>
        <Field label={t("Password")} error={f.formState.errors.password?.message && t(f.formState.errors.password.message)}>
          {(id, d) => <Input id={id} type="password" autoComplete="current-password" aria-describedby={d}
            aria-invalid={!!f.formState.errors.password} {...f.register("password")} />}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={f.formState.isSubmitting}>{t("Log in")}</Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        {t("New to BoltiToli?")} <Link to="/register" className="font-semibold text-teal-700 underline-offset-4 hover:underline">{t("Create an account")}</Link>
      </p>
      <div className="mt-8 border-t border-line pt-6">
        <p className="text-sm text-ink-muted mb-3">
          {t("Want to look around first? The demo school uses simulated sessions, clearly labelled.")}
        </p>
        <Button variant="secondary" loading={demoLoading} onClick={async () => {
          setDemoLoading(true);
          setError(null);
          try {
            after(await loginDemo());
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setDemoLoading(false);
          }
        }}>{t("Explore the demo school")}</Button>
      </div>
    </AuthLayout>
  );
}

const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters")
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Use letters and at least one number")
    .refine((v) => new TextEncoder().encode(v).length <= 72, "Password is too long"),
  school_name: z.string().trim().min(2, "Enter your school’s name"),
  udise_code: z.string().trim().regex(/^(\d{6,20})?$/, "UDISE code is 6–20 digits").optional(),
  district: z.string().trim().max(100).optional(),
});

export function RegisterPage() {
  const { register: doRegister } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const f = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });
  const e = f.formState.errors;
  const t = useT();
  const err = (m?: string) => (m ? t(m) : undefined);

  const submit = f.handleSubmit(async (v) => {
    setError(null);
    try {
      await doRegister({
        full_name: v.full_name, email: v.email, password: v.password,
        school: { name: v.school_name, udise_code: v.udise_code || null, district: v.district || null },
      });
      nav("/onboarding", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") f.setError("email", { message: t("An account with this email already exists. Log in instead.") });
      else setError(errorMessage(err));
    }
  });

  return (
    <AuthLayout title={t("Create your account")} sub={t("Set up your school in about two minutes.")}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label={t("Your name")} error={err(e.full_name?.message)}>
          {(id, d) => <Input id={id} autoComplete="name" aria-describedby={d} aria-invalid={!!e.full_name} {...f.register("full_name")} />}
        </Field>
        <Field label={t("Email")} error={err(e.email?.message)}>
          {(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d} aria-invalid={!!e.email} {...f.register("email")} />}
        </Field>
        <Field label={t("Password")} hint={t("At least 8 characters with a number.")} error={err(e.password?.message)}>
          {(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={!!e.password} {...f.register("password")} />}
        </Field>
        <Field label={t("School name")} error={err(e.school_name?.message)}>
          {(id, d) => <Input id={id} placeholder={t("e.g. GPS Rampur")} aria-describedby={d} aria-invalid={!!e.school_name} {...f.register("school_name")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("UDISE code")} optional error={err(e.udise_code?.message)}>
            {(id, d) => <Input id={id} inputMode="numeric" aria-describedby={d} aria-invalid={!!e.udise_code} {...f.register("udise_code")} />}
          </Field>
          <Field label={t("District")} optional error={err(e.district?.message)}>
            {(id, d) => <Input id={id} aria-describedby={d} {...f.register("district")} />}
          </Field>
        </div>
        <p className="text-[13px] text-ink-muted">
          {t("You will be the administrator for this school and can add other teachers later.")}
        </p>
        <Button type="submit" className="w-full" size="lg" loading={f.formState.isSubmitting}>{t("Create account")}</Button>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        {t("Already have an account?")} <Link to="/login" className="font-semibold text-teal-700 underline-offset-4 hover:underline">{t("Log in")}</Link>
      </p>
    </AuthLayout>
  );
}
