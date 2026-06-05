// Braille logic self-test. Run: node apps/web/scripts/test-braille.ts
import { charToBits, textToCells, CELL_DOWN, NUMBER_SIGN, CAPITAL_SIGN } from "../lib/braille.ts";

let pass = 0;
let fail = 0;
const bad: string[] = [];
function ok(cond: boolean, msg: string) {
  if (cond) pass++;
  else {
    fail++;
    bad.push(msg);
  }
}
const setBits = (s: string) =>
  s
    .split("")
    .map((c, i) => (c === "1" ? i + 1 : 0))
    .filter(Boolean)
    .join(",");

// 1) Canonical alphabet (standard Grade-1 patterns, dot order 1..6)
const A: Record<string, string> = {
  a: "100000", b: "110000", c: "100100", d: "100110", e: "100010",
  f: "110100", g: "110110", h: "110010", i: "010100", j: "010110",
  k: "101000", l: "111000", m: "101100", n: "101110", o: "101010",
  p: "111100", q: "111110", r: "111010", s: "011100", t: "011110",
  u: "101001", v: "111001", w: "010111", x: "101101", y: "101111", z: "101011",
};
for (const [ch, bits] of Object.entries(A)) {
  ok(charToBits(ch) === bits, `letter ${ch} should be ${bits} got ${charToBits(ch)}`);
  ok(charToBits(ch.toUpperCase()) === bits, `UPPER ${ch} should map same`);
}

// 2) All 26 patterns unique + exactly 6 bits
const seen = new Set<string>();
for (const [ch, bits] of Object.entries(A)) {
  ok(bits.length === 6, `${ch} not 6 bits`);
  ok(!seen.has(bits), `${ch} duplicate pattern ${bits}`);
  seen.add(bits);
}

// 3) The decade RULES the agent teaches must actually hold
const d1 = "abcdefghij".split("");
const d2 = "klmnopqrst".split("");
const addDot = (bits: string, dot: number) =>
  bits.split("").map((c, i) => (i === dot - 1 ? "1" : c)).join("");
d1.forEach((c, i) => {
  // k..t = a..j + dot 3
  ok(A[d2[i]] === addDot(A[c], 3), `decade2 rule: ${d2[i]} should be ${c}+dot3`);
});
// u,v,x,y,z = a,b,c,d,e + dots 3 and 6
const d3pairs: [string, string][] = [["u", "a"], ["v", "b"], ["x", "c"], ["y", "d"], ["z", "e"]];
for (const [u, base] of d3pairs) {
  ok(A[u] === addDot(addDot(A[base], 3), 6), `decade3 rule: ${u} should be ${base}+dots3,6`);
}

// 4) Digits reuse a..j; number sign correct
ok(charToBits("1") === A["a"], "1 == a pattern");
ok(charToBits("0") === A["j"], "0 == j pattern");
ok(NUMBER_SIGN === "001111", "number sign dots 3-4-5-6");
ok(CAPITAL_SIGN === "000001", "capital sign dot 6");

// 5) Punctuation + space
ok(charToBits(" ") === "000000", "space all down");
ok(charToBits(".") !== null, "period mapped");
ok(charToBits("?") !== null, "question mapped");

// 6) Unknown chars
ok(charToBits("€") === null, "euro sign unknown -> null");
ok(charToBits("中") === null, "CJK char unknown -> null");

// 7) textToCells: words, caps, numbers, unknowns
const cat = textToCells("cat");
ok(cat.length === 3 && cat.map((c) => c.bits).join("|") === [A.c, A.a, A.t].join("|"), "cat -> c,a,t");

const cap = textToCells("Hi");
ok(cap[0].bits === CAPITAL_SIGN, "Hi: leading capital sign");
ok(cap[1].bits === A.h && cap[2].bits === A.i, "Hi: H then i");

const num = textToCells("42");
ok(num[0].bits === NUMBER_SIGN, "42: number sign first");
ok(num[1].bits === A.d && num[2].bits === A.b, "42: d(4) then b(2)");

const mixed = textToCells("a1");
ok(mixed.some((c) => c.bits === NUMBER_SIGN), "a1: number sign before the digit");

const unknown = textToCells("a€");
ok(unknown[unknown.length - 1].bits === CELL_DOWN, "unknown char -> blank cell, no crash");

// 8) Empty / weird input never throws
ok(charToBits("") === null, "empty char -> null");
ok(textToCells("").length === 0, "empty string -> no cells");
ok(textToCells("   ").every((c) => c.bits === "000000"), "spaces -> all-down cells");

console.log(`\nBRAILLE TESTS: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("FAILURES:");
  bad.forEach((b) => console.log("  ✗ " + b));
  process.exit(1);
}
console.log("✓ all braille logic correct (alphabet, decade rules, digits, caps, punctuation, edge cases)");
