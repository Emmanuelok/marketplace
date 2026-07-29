import { describe, expect, it } from "vitest";

import {
  add,
  allocate,
  allocateByWeights,
  applyBps,
  clampToZero,
  formatMoney,
  formatMoneyCompact,
  fromMajor,
  money,
  multiply,
  parseMoney,
  scale,
  serializeMoney,
  subtract,
  sum,
  toMajor,
  zero,
} from "./money";

describe("construction", () => {
  it("rejects non-integer minor units", () => {
    expect(() => money(10.5, "GHS")).toThrow(TypeError);
  });

  it("rejects values beyond the safe integer range", () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, "GHS")).toThrow();
  });

  it("accepts negative amounts, which discounts and refunds need", () => {
    expect(money(-500, "GHS").minor).toBe(-500);
  });
});

describe("fromMajor", () => {
  it("converts whole and fractional cedis", () => {
    expect(fromMajor(149.99, "GHS").minor).toBe(14_999);
    expect(fromMajor(1000, "GHS").minor).toBe(100_000);
  });

  it("survives binary float representation error", () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE-754, which naive rounding
    // turns into 100 rather than 101.
    expect(fromMajor(1.005, "GHS").minor).toBe(101);
    expect(fromMajor(0.1 + 0.2, "GHS").minor).toBe(30);
    expect(fromMajor(8.165, "GHS").minor).toBe(817);
  });

  it("round-trips through toMajor", () => {
    expect(toMajor(fromMajor(2499.5, "GHS"))).toBe(2499.5);
  });
});

describe("currency safety", () => {
  it("refuses to add different currencies", () => {
    expect(() => add(money(100, "GHS"), money(100, "USD"))).toThrow(TypeError);
  });

  it("names both currencies in the error, so the bug is findable", () => {
    expect(() => subtract(money(100, "GHS"), money(50, "USD"))).toThrow(/GHS.*USD/);
  });

  it("sums a list in a declared currency", () => {
    const total = sum([money(100, "GHS"), money(250, "GHS"), money(-50, "GHS")], "GHS");
    expect(total.minor).toBe(300);
  });

  it("sums an empty list to zero", () => {
    expect(sum([], "GHS")).toEqual(zero("GHS"));
  });
});

describe("arithmetic", () => {
  it("multiplies by a whole quantity without rounding", () => {
    expect(multiply(money(333, "GHS"), 3).minor).toBe(999);
  });

  it("rejects a fractional quantity", () => {
    expect(() => multiply(money(100, "GHS"), 1.5)).toThrow(TypeError);
  });

  it("applies basis points exactly", () => {
    // 15% VAT on GH₵100.00
    expect(applyBps(money(10_000, "GHS"), 1_500).minor).toBe(1_500);
    // 2.5% NHIL
    expect(applyBps(money(10_000, "GHS"), 250).minor).toBe(250);
  });

  it("rounds half away from zero symmetrically on negatives", () => {
    expect(scale(money(5, "GHS"), 0.5, "half-up").minor).toBe(3);
    expect(scale(money(-5, "GHS"), 0.5, "half-up").minor).toBe(-3);
  });

  it("supports directional rounding modes", () => {
    expect(scale(money(10, "GHS"), 0.11, "up").minor).toBe(2);
    expect(scale(money(10, "GHS"), 0.19, "down").minor).toBe(1);
  });

  it("clamps a negative total to zero", () => {
    expect(clampToZero(money(-250, "GHS")).minor).toBe(0);
    expect(clampToZero(money(250, "GHS")).minor).toBe(250);
  });
});

describe("allocate", () => {
  it("splits without losing minor units", () => {
    const shares = allocate(money(1_000, "GHS"), 3);
    expect(shares.map((s) => s.minor)).toEqual([334, 333, 333]);
    expect(shares.reduce((total, s) => total + s.minor, 0)).toBe(1_000);
  });

  it("splits evenly when it divides cleanly", () => {
    expect(allocate(money(900, "GHS"), 3).map((s) => s.minor)).toEqual([300, 300, 300]);
  });

  it("handles negative amounts, as a refund split would", () => {
    const shares = allocate(money(-1_000, "GHS"), 3);
    expect(shares.reduce((total, s) => total + s.minor, 0)).toBe(-1_000);
  });

  it("rejects a non-positive part count", () => {
    expect(() => allocate(money(100, "GHS"), 0)).toThrow(RangeError);
  });
});

describe("allocateByWeights", () => {
  it("distributes an order discount across lines without drift", () => {
    // A GH₵100 discount across three lines of very different value.
    const shares = allocateByWeights(money(10_000, "GHS"), [5_000, 3_000, 2_000]);
    expect(shares.reduce((total, s) => total + s.minor, 0)).toBe(10_000);
    expect(shares[0]!.minor).toBeGreaterThan(shares[2]!.minor);
  });

  it("preserves the total on awkward weights", () => {
    const shares = allocateByWeights(money(1_000, "GHS"), [1, 1, 1]);
    expect(shares.reduce((total, s) => total + s.minor, 0)).toBe(1_000);
  });

  it("falls back to an even split when all weights are zero", () => {
    const shares = allocateByWeights(money(900, "GHS"), [0, 0, 0]);
    expect(shares.reduce((total, s) => total + s.minor, 0)).toBe(900);
  });
});

describe("serialisation", () => {
  it("round-trips", () => {
    const original = money(149_999, "GHS");
    expect(parseMoney(serializeMoney(original))).toEqual(original);
  });

  it("rejects a malformed string", () => {
    expect(() => parseMoney("GHS")).toThrow(TypeError);
    expect(() => parseMoney("XYZ:100")).toThrow(TypeError);
    expect(() => parseMoney("GHS:12.5")).toThrow(TypeError);
  });
});

describe("formatting", () => {
  it("renders the cedi symbol and grouping", () => {
    expect(formatMoney(money(149_900, "GHS"))).toBe("GH₵1,499.00");
  });

  it("drops decimals on whole amounts when asked", () => {
    expect(formatMoney(money(149_900, "GHS"), { compactDecimals: true })).toBe("GH₵1,499");
    expect(formatMoney(money(149_950, "GHS"), { compactDecimals: true })).toBe("GH₵1,499.50");
  });

  it("marks negatives with a true minus sign, not a hyphen", () => {
    expect(formatMoney(money(-5_000, "GHS"))).toBe("−GH₵50.00");
  });

  it("compacts large figures for dense UI", () => {
    expect(formatMoneyCompact(money(1_250_000, "GHS"))).toBe("GH₵12.5k");
    expect(formatMoneyCompact(money(250_000_000, "GHS"))).toBe("GH₵2.5M");
    expect(formatMoneyCompact(money(9_900, "GHS"))).toBe("GH₵99");
  });
});
