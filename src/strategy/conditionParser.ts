// 전략 JSON의 조건/트리거 문자열을 안전하게 평가한다. 문서 5/10/11장.
// 지원 문법: 숫자, 식별자(dotted 가능), + - * /, 단항 -, 괄호,
//            비교(> >= < <= == !=), 논리 AND/OR.
// eval()을 쓰지 않는 자체 재귀하강 파서 — 임의 코드 실행을 막는다.
import type { EvalContext, Operator } from '../types';

type Token = { type: 'num' | 'id' | 'op' | 'lparen' | 'rparen'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const ops = ['>=', '<=', '==', '!=', '>', '<', '+', '-', '*', '/'];
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'lparen', value: c });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', value: c });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) num += input[i++];
      tokens.push({ type: 'num', value: num });
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let id = '';
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) id += input[i++];
      const upper = id.toUpperCase();
      if (upper === 'AND' || upper === 'OR') tokens.push({ type: 'op', value: upper });
      else tokens.push({ type: 'id', value: id });
      continue;
    }
    const matched = ops.find((op) => input.startsWith(op, i));
    if (matched) {
      tokens.push({ type: 'op', value: matched });
      i += matched.length;
      continue;
    }
    throw new Error(`알 수 없는 토큰: '${c}' (in "${input}")`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly ctx: EvalContext,
  ) {}

  parse(): number {
    const v = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error('남은 토큰이 있습니다');
    }
    return v;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(): Token {
    return this.tokens[this.pos++];
  }

  // 논리 결과는 1/0으로 표현한다.
  private parseOr(): number {
    let left = this.parseAnd();
    while (this.peek()?.value === 'OR') {
      this.eat();
      const right = this.parseAnd();
      left = left || right ? 1 : 0;
    }
    return left;
  }

  private parseAnd(): number {
    let left = this.parseComparison();
    while (this.peek()?.value === 'AND') {
      this.eat();
      const right = this.parseComparison();
      left = left && right ? 1 : 0;
    }
    return left;
  }

  private parseComparison(): number {
    let left = this.parseAddSub();
    const t = this.peek();
    if (t && t.type === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(t.value)) {
      this.eat();
      const right = this.parseAddSub();
      return compare(left, t.value as Operator, right) ? 1 : 0;
    }
    return left;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.peek()?.value === '+' || this.peek()?.value === '-') {
      const op = this.eat().value;
      const right = this.parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parseUnary();
    while (this.peek()?.value === '*' || this.peek()?.value === '/') {
      const op = this.eat().value;
      const right = this.parseUnary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private parseUnary(): number {
    if (this.peek()?.value === '-') {
      this.eat();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.eat();
    if (!t) throw new Error('예상치 못한 끝');
    if (t.type === 'num') return Number(t.value);
    if (t.type === 'lparen') {
      const v = this.parseOr();
      if (this.eat()?.type !== 'rparen') throw new Error("')' 누락");
      return v;
    }
    if (t.type === 'id') {
      const v = this.ctx[t.value];
      if (v === undefined) throw new Error(`알 수 없는 변수: ${t.value}`);
      return v;
    }
    throw new Error(`예상치 못한 토큰: ${t.value}`);
  }
}

export function compare(left: number, op: Operator, right: number): boolean {
  switch (op) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return left === right;
    case '!=':
      return left !== right;
  }
}

// 산술 표현식 → 숫자.
export function evaluateExpression(expr: string | number, ctx: EvalContext): number {
  if (typeof expr === 'number') return expr;
  return new Parser(tokenize(expr), ctx).parse();
}

// 비교/논리 표현식 → boolean. 결과가 NaN이면 false.
export function evaluateTrigger(expr: string, ctx: EvalContext): boolean {
  const v = new Parser(tokenize(expr), ctx).parse();
  return v === 1;
}
