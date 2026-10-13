import { STAR_KEYS, type StarFlags } from "../../server/services/star";
import { cx } from "./ui";

/** Compact S T A R indicator; lit letters are covered. */
export function StarBadge({ star }: { star: StarFlags }) {
  return (
    <span className="flex shrink-0 font-mono text-xs" title={`STAR: ${STAR_KEYS.filter((k) => star[k]).join(", ") || "none"}`}>
      {STAR_KEYS.map((k) => (
        <span key={k} className={cx("w-2.5 text-center", star[k] ? "text-accent" : "text-muted/40")}>
          {k[0]!.toUpperCase()}
        </span>
      ))}
    </span>
  );
}
