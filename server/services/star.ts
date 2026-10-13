// STAR (Situation, Task, Action, Result) tagging for entries.

export const STAR_KEYS = ["situation", "task", "action", "result"] as const;
export type StarKey = (typeof STAR_KEYS)[number];
export type StarFlags = Record<StarKey, boolean>;

export interface StarRow {
  star_situation: number;
  star_task: number;
  star_action: number;
  star_result: number;
}

export function starFromRow(row: StarRow): StarFlags {
  return {
    situation: row.star_situation === 1,
    task: row.star_task === 1,
    action: row.star_action === 1,
    result: row.star_result === 1,
  };
}

export function starToRow(flags: Partial<StarFlags>): StarRow {
  return {
    star_situation: flags.situation ? 1 : 0,
    star_task: flags.task ? 1 : 0,
    star_action: flags.action ? 1 : 0,
    star_result: flags.result ? 1 : 0,
  };
}

/** How many of the four STAR parts are covered (0-4). */
export const starScore = (flags: StarFlags) => STAR_KEYS.filter((k) => flags[k]).length;

export const starComplete = (flags: StarFlags) => starScore(flags) === STAR_KEYS.length;

export const missingStar = (flags: StarFlags): StarKey[] => STAR_KEYS.filter((k) => !flags[k]);

// Keyword hints for pre-ticking the form. Suggestions only; the user decides.
const HINTS: Record<StarKey, RegExp> = {
  situation: /\b(context|background|situation|currently|existing|the team|the client|the business|problem was|issue was|because)\b/i,
  task: /\b(task|asked to|needed to|need to|had to|goal|aim|objective|responsible for|requirement|so that)\b/i,
  action: /\b(i (built|wrote|created|implemented|designed|configured|fixed|refactored|tested|deployed|set up|added|researched|investigated|led|presented|reviewed|analysed|analyzed|documented|migrated|automated))\b/i,
  result: /\b(result|outcome|as a result|reduced|increased|improved|saved|resolved|delivered|shipped|now|which meant|led to|feedback|%)/i,
};

export function suggestStar(text: string): StarFlags {
  return {
    situation: HINTS.situation.test(text),
    task: HINTS.task.test(text),
    action: HINTS.action.test(text),
    result: HINTS.result.test(text),
  };
}
