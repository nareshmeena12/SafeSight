/**
 * A small, safe formula language for per-student numbers (S18): numbers,
 * variable names, + - * / ^, brackets and a few maths functions. Parsed into
 * a tree and evaluated without `eval`, so a teacher's formula can never run
 * code. Pure; used by the teacher form, Sage and the auto-check.
 */

export type Expr =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; arg: Expr }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: Expr; right: Expr }
  | { kind: "call"; fn: FunctionName; args: Expr[] };

const functions = {
  sqrt: { arity: 1, fn: (x: number) => Math.sqrt(x) },
  abs: { arity: 1, fn: (x: number) => Math.abs(x) },
  ln: { arity: 1, fn: (x: number) => Math.log(x) },
  log: { arity: 1, fn: (x: number) => Math.log10(x) },
  exp: { arity: 1, fn: (x: number) => Math.exp(x) },
  sin: { arity: 1, fn: (x: number) => Math.sin(x) },
  cos: { arity: 1, fn: (x: number) => Math.cos(x) },
  tan: { arity: 1, fn: (x: number) => Math.tan(x) },
  asin: { arity: 1, fn: (x: number) => Math.asin(x) },
  acos: { arity: 1, fn: (x: number) => Math.acos(x) },
  atan: { arity: 1, fn: (x: number) => Math.atan(x) },
  min: { arity: 2, fn: (a: number, b: number) => Math.min(a, b) },
  max: { arity: 2, fn: (a: number, b: number) => Math.max(a, b) },
  pow: { arity: 2, fn: (a: number, b: number) => a ** b },
} as const;
type FunctionName = keyof typeof functions;

const constants: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Names a teacher can't use for a variable. */
export const reservedNames = new Set([...Object.keys(functions), ...Object.keys(constants)]);

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

type Token = { type: "num"; value: number } | { type: "name"; value: string } | { type: "op"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  // Accept the symbols people paste from documents: × · ÷ − and **.
  const text = source.replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-").replace(/\*\*/g, "^");
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(i));
    if (num) {
      tokens.push({ type: "num", value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (name) {
      tokens.push({ type: "name", value: name[0] });
      i += name[0].length;
      continue;
    }
    if ("+-*/^(),".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new FormulaError(`The formula can't use "${ch}".`);
  }
  return tokens;
}

/** Parses a formula, or throws a FormulaError with a plain message. */
export function parseFormula(source: string): Expr {
  if (source.length > 500) throw new FormulaError("Keep the formula under 500 characters.");
  const tokens = tokenize(source);
  if (tokens.length === 0) throw new FormulaError("Write a formula for the answer.");
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.type === "op" && peek()!.value === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new FormulaError(v === ")" ? "A bracket isn't closed." : `Expected "${v}".`);
    pos++;
  };

  // expr := term (('+'|'-') term)*
  function expr(): Expr {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { value: "+" | "-" }).value;
      left = { kind: "bin", op, left, right: term() };
    }
    return left;
  }
  // term := unary (('*'|'/') unary | implicit-multiply)*
  function term(): Expr {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (tokens[pos++] as { value: "*" | "/" }).value;
        left = { kind: "bin", op, left, right: unary() };
      } else if (peek() && (peek()!.type === "name" || isOp("("))) {
        // "2 m g" or "2(m+1)": implicit multiplication, as written on paper.
        left = { kind: "bin", op: "*", left, right: unary() };
      } else {
        return left;
      }
    }
  }
  // unary := '-' unary | '+' unary | power
  function unary(): Expr {
    if (isOp("-")) {
      pos++;
      return { kind: "neg", arg: unary() };
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return power();
  }
  // power := atom ('^' unary)?   (right-associative, so 2^3^2 = 2^9)
  function power(): Expr {
    const base = atom();
    if (isOp("^")) {
      pos++;
      return { kind: "bin", op: "^", left: base, right: unary() };
    }
    return base;
  }
  function atom(): Expr {
    const t = peek();
    if (!t) throw new FormulaError("The formula ends too early.");
    if (t.type === "num") {
      pos++;
      return { kind: "num", value: t.value };
    }
    if (t.type === "name") {
      pos++;
      if (isOp("(")) {
        if (!(t.value in functions)) throw new FormulaError(`"${t.value}" isn't a function the formula knows.`);
        pos++;
        const args: Expr[] = [expr()];
        while (isOp(",")) {
          pos++;
          args.push(expr());
        }
        expectOp(")");
        const fn = t.value as FunctionName;
        if (args.length !== functions[fn].arity) {
          throw new FormulaError(`${fn}() takes ${functions[fn].arity === 1 ? "one value" : "two values"}.`);
        }
        return { kind: "call", fn, args };
      }
      if (t.value in functions) throw new FormulaError(`Put brackets after ${t.value}, e.g. ${t.value}(x).`);
      return { kind: "var", name: t.value };
    }
    if (t.value === "(") {
      pos++;
      const inner = expr();
      expectOp(")");
      return inner;
    }
    throw new FormulaError(`Unexpected "${t.value}" in the formula.`);
  }

  const tree = expr();
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new FormulaError(t.type === "op" && t.value === ")" ? "There's an extra closing bracket." : `Unexpected "${t.value}" in the formula.`);
  }
  return tree;
}

/** Variable names the formula uses (constants such as pi and e excluded). */
export function formulaNames(tree: Expr): string[] {
  const names = new Set<string>();
  const walk = (e: Expr) => {
    if (e.kind === "var") {
      if (!(e.name in constants)) names.add(e.name);
    } else if (e.kind === "neg") walk(e.arg);
    else if (e.kind === "bin") {
      walk(e.left);
      walk(e.right);
    } else if (e.kind === "call") e.args.forEach(walk);
  };
  walk(tree);
  return [...names];
}

export function evaluate(tree: Expr, scope: Record<string, number>): number {
  switch (tree.kind) {
    case "num":
      return tree.value;
    case "var": {
      if (Object.hasOwn(scope, tree.name)) return scope[tree.name];
      if (tree.name in constants) return constants[tree.name];
      throw new FormulaError(`"${tree.name}" isn't one of the variables.`);
    }
    case "neg":
      return -evaluate(tree.arg, scope);
    case "bin":
      return binary(tree.op, evaluate(tree.left, scope), evaluate(tree.right, scope));
    case "call": {
      const f = functions[tree.fn].fn as (...args: number[]) => number;
      return f(...tree.args.map((a) => evaluate(a, scope)));
    }
  }
}

function binary(op: "+" | "-" | "*" | "/" | "^", a: number, b: number): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return a / b;
  return a ** b;
}
