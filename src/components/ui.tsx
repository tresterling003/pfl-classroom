"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 disabled:bg-brand-300",
  secondary: "bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 disabled:text-ink-400",
  ghost: "text-ink-700 hover:bg-ink-100 disabled:text-ink-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
};
const SIZES = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-[15px]", lg: "h-12 px-6 text-base", xl: "h-14 px-8 text-lg" };

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed select-none whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink-700">
      {children}
      {hint && <span className="ml-1 font-normal text-ink-500">{hint}</span>}
    </label>
  );
}

/** Fields are full width unless the caller passes its own width class. */
const width = (className?: string) => (className && /(^|\s)(w-|max-w-|min-w-)/.test(className) ? "" : "w-full");
const fieldCls =
  "rounded-xl border border-ink-200 bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-ink-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, width(className), "h-11", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldCls, width(className), "py-2.5 leading-relaxed", className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(fieldCls, width(className), "h-11 pr-8", className)}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3", disabled && "opacity-50")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand-600" : "bg-ink-300")}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      <span>
        <span className="block text-[15px] font-medium text-ink-800">{label}</span>
        {description && <span className="block text-sm text-ink-500">{description}</span>}
      </span>
    </label>
  );
}

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cx("rounded-2xl border border-ink-200/80 bg-white shadow-sm shadow-ink-900/[0.03]", className)}>
      {children}
    </div>
  );
}

type Tone = "gray" | "brand" | "green" | "amber" | "red" | "sky" | "violet";
const TONES: Record<Tone, string> = {
  gray: "bg-ink-100 text-ink-700",
  brand: "bg-brand-100 text-brand-800",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  sky: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "green" | "amber" }) {
  const color = tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-brand-600";
  return (
    <div className={cx("h-2.5 w-full overflow-hidden rounded-full bg-ink-100", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx("m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-2xl backdrop:bg-ink-900/40 backdrop:backdrop-blur-[2px]", wide ? "max-w-4xl" : "max-w-lg")}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
            <h2 className="text-lg font-bold text-ink-900">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ───────────── confirm dialog ─────────────

interface ConfirmOpts {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Require typing this word to confirm (for destructive actions). */
  typeToConfirm?: string;
}

const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
const ToastCtx = createContext<(msg: string, tone?: "ok" | "error") => void>(() => {});

export function useConfirm() {
  return useContext(ConfirmCtx);
}
export function useToast() {
  return useContext(ToastCtx);
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<(v: boolean) => void>(() => {});
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: "ok" | "error" }[]>([]);

  const confirm = useCallback((o: ConfirmOpts) => {
    setTyped("");
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const close = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
  };
  const toast = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      <ToastCtx.Provider value={toast}>
        {children}
        <Modal open={!!opts} onClose={() => close(false)} title={opts?.title ?? ""}>
          <div className="space-y-4 text-[15px] text-ink-700">
            <div className="whitespace-pre-line">{opts?.message}</div>
            {opts?.typeToConfirm && (
              <div>
                <Label>
                  Type <b>{opts.typeToConfirm}</b> to confirm
                </Label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                variant={opts?.danger ? "danger" : "primary"}
                disabled={!!opts?.typeToConfirm && typed.trim().toUpperCase() !== opts.typeToConfirm.toUpperCase()}
                onClick={() => close(true)}
              >
                {opts?.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </Modal>
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cx(
                "pointer-events-auto animate-rise rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg whitespace-pre-line max-w-md",
                t.tone === "error" ? "bg-rose-600 text-white" : "bg-ink-900 text-white",
              )}
            >
              {t.msg}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      <h3 className="text-lg font-bold text-ink-800">{title}</h3>
      {children && <div className="mx-auto mt-1 max-w-md text-ink-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "green" | "amber" | "brand" }) {
  const color = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "brand" ? "text-brand-600" : "text-ink-900";
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cx("mt-1 text-3xl font-bold tabular-nums", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-500">{sub}</div>}
    </Card>
  );
}
