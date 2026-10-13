import { cx } from "./ui";

export const QUALITY_LABELS = ["", "Strong", "Good", "OK", "Weak", "Poor"] as const;

/** 1-5 picker, 1 = best. Segmented rather than a range input so the value is always visible. */
export function QualitySlider({ value, onChange, size = "md" }: { value: number; onChange: (q: number) => void; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label="Quality (1 = best)" className="inline-flex overflow-hidden rounded-ui border border-border">
      {[1, 2, 3, 4, 5].map((q) => (
        <button
          key={q}
          type="button"
          role="radio"
          aria-checked={value === q}
          title={`${q}: ${QUALITY_LABELS[q]}`}
          onClick={() => onChange(q)}
          className={cx(
            "border-r border-border tabular-nums last:border-r-0",
            size === "sm" ? "px-1.5 text-xs" : "px-2.5 py-0.5 text-sm",
            value === q ? "bg-accent/15 text-text shadow-[inset_0_0_0_1px_var(--color-accent)]" : "text-muted hover:text-text",
          )}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
