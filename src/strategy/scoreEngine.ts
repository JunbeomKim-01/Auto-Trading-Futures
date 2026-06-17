// 점수제 진입 판단. 문서 6장.
import type { EntrySide, EvalContext } from '../types';
import { compare, evaluateExpression } from './conditionParser';

export interface ScoreResult {
  passed: boolean;          // hardFilter 전부 통과 && score >= minimumScore
  hardFilterPassed: boolean;
  score: number;
  minimumScore: number;
  matchedRules: string[];   // 점수가 가산된 룰 이름
  blockedBy: string[];      // 막은 hardFilter 설명
}

export function evaluateEntry(side: EntrySide, ctx: EvalContext): ScoreResult {
  const blockedBy: string[] = [];
  for (const f of side.hardFilters) {
    const left = evaluateExpression(f.left, ctx);
    const right = evaluateExpression(f.right, ctx);
    const ok = !Number.isNaN(left) && !Number.isNaN(right) && compare(left, f.operator, right);
    if (!ok) blockedBy.push(f.description ?? `${f.left} ${f.operator} ${f.right}`);
  }
  const hardFilterPassed = blockedBy.length === 0;

  let score = 0;
  const matchedRules: string[] = [];
  for (const r of side.scoreRules) {
    const left = evaluateExpression(r.left, ctx);
    const right = evaluateExpression(r.right, ctx);
    if (!Number.isNaN(left) && !Number.isNaN(right) && compare(left, r.operator, right)) {
      score += r.score;
      matchedRules.push(r.name);
    }
  }

  return {
    passed: hardFilterPassed && score >= side.minimumScore,
    hardFilterPassed,
    score,
    minimumScore: side.minimumScore,
    matchedRules,
    blockedBy,
  };
}
