import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";
import en from "../../../messages/en.json";

type Node = {
  type: number;
  value?: string;
  options?: Record<string, { value: Node[] }>;
  children?: Node[];
};

// A value left out of `t()` makes ICU show the raw message source to the user.
const CALL =
  /(?:\bt\(\s*|appError\(\s*"[A-Z_]+",\s*)["']([a-zA-Z]+\.[^"'`]+)["']\s*(,|\))/g;
const LITERAL = 0;
const POUND = 7;
const TAG = 8;

function argumentNames(ast: Node[], acc = new Set<string>()): Set<string> {
  for (const el of ast) {
    if (el.type !== LITERAL && el.type !== POUND && el.type !== TAG) {
      acc.add(el.value as string);
    }
    for (const o of Object.values(el.options ?? {})) {
      argumentNames(o.value, acc);
    }
    if (el.children) argumentNames(el.children, acc);
  }
  return acc;
}

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      en,
    );
}

/** The text up to the parenthesis closing the call whose arguments start at `from`. */
function restOfCall(source: string, from: number): string {
  let depth = 1;
  let i = from;
  for (; depth > 0 && i < source.length; i++) {
    if ("([{".includes(source[i]!)) depth++;
    if (")]}".includes(source[i]!)) depth--;
  }
  return source.slice(from, i);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("translated message calls", () => {
  it("pass every value their English message needs", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(CALL)) {
        const [, key, next] = match;
        const message = lookup(key!);
        if (typeof message !== "string") continue;
        const ast = new IntlMessageFormat(message, "en").getAst() as Node[];
        const names = [...argumentNames(ast)];
        if (names.length === 0) continue;
        const rest =
          next === ")" ? "" : restOfCall(source, match.index + match[0].length);
        // A spread or a variable holding the values cannot be checked here.
        if (rest.includes("...") || /^\s*\w+\s*\)$/.test(rest)) continue;
        for (const name of names) {
          if (!new RegExp(`\\b${name}\\b`).test(rest)) {
            missing.push(`${key} needs ${name}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
