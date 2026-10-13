import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "default" | "primary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  default: "border-border bg-surface-2 hover:border-accent-muted",
  // Accent stays an outline; only a hover/active state gets a faint fill.
  primary: "border-accent text-text hover:bg-accent/15",
  danger: "border-bad/50 text-bad hover:bg-bad/10",
  ghost: "border-transparent text-muted hover:border-border hover:text-text",
};

export function Button({ variant = "default", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx("rounded-ui border px-2.5 py-1 text-sm transition-colors disabled:opacity-50", variants[variant], className)}
    />
  );
}

const field = "min-w-0 rounded-ui border border-border bg-bg px-2 py-1 text-sm placeholder:text-muted/60 focus:border-accent-muted focus:outline-none";

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(field, "min-h-20 resize-y", className)} />
);
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, className)} />;

export function Label({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span className="text-xs text-muted">{text}</span>
      {children}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-ui border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-ui border border-border bg-surface px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const Tag = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cx("inline-block rounded-ui border border-border px-1.5 font-mono text-xs", className)}>{children}</span>
);

export type Light = "red" | "yellow" | "green";
const lightColour: Record<Light, string> = { red: "bg-untouched", yellow: "bg-warn", green: "bg-ok" };
export const lightLabel: Record<Light, string> = { red: "Untouched", yellow: "Weak", green: "Solid" };

export const LightDot = ({ light }: { light: Light }) => (
  <span title={lightLabel[light]} className={cx("inline-block size-2 shrink-0 rounded-full", lightColour[light])} />
);

export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? <p className="rounded-ui border border-bad/50 px-2 py-1 text-sm text-bad">{children}</p> : null;

export { cx };
