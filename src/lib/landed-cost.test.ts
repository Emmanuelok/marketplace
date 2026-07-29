import { describe, expect, it } from "vitest";

import { GHANA_LEVIES } from "./ghana";
import {
  chargeableWeightKg,
  computeLandedCost,
  landedCostMultiple,
  volumetricWeightKg,
  type LandedCostInput,
} from "./landed-cost";
import { fromMajor, sum } from "./money";

/** A laptop from the US by air economy. Reused across cases. */
function baseInput(overrides: Partial<LandedCostInput> = {}): LandedCostInput {
  return {
    supplierUnitPrice: fromMajor(1000, "USD"),
    quantity: 1,
    dimensions: { lengthCm: 40, widthCm: 30, heightCm: 10, weightKg: 2 },
    origin: "US",
    freightMode: "air-economy",
    dutyBand: "ELECTRONICS",
    // A round rate keeps the hand-computed expectations below readable.
    fxRate: 10,
    fxSpreadBps: 0,
    tariff: { perKgMinor: 0, handlingMinor: 0, minimumMinor: 0 },
    marginBps: 0,
    insuranceBps: 0,
    ...overrides,
  };
}

describe("chargeable weight", () => {
  it("uses the greater of actual and volumetric weight", () => {
    // 40x30x10 = 12000 cm3 / 6000 = 2kg volumetric, vs 5kg actual.
    const heavy = chargeableWeightKg(
      { lengthCm: 40, widthCm: 30, heightCm: 10, weightKg: 5 },
      "air-economy",
    );
    expect(heavy).toBe(5);

    // 60x50x40 = 120000 / 6000 = 20kg volumetric, vs 3kg actual.
    const bulky = chargeableWeightKg(
      { lengthCm: 60, widthCm: 50, heightCm: 40, weightKg: 3 },
      "air-economy",
    );
    expect(bulky).toBe(20);
  });

  it("rounds up to the next half kilogram", () => {
    const weight = chargeableWeightKg(
      { lengthCm: 10, widthCm: 10, heightCm: 10, weightKg: 2.1 },
      "air-economy",
    );
    expect(weight).toBe(2.5);
  });

  it("applies the mode-specific volumetric divisor", () => {
    const dimensions = { lengthCm: 50, widthCm: 40, heightCm: 30, weightKg: 1 };
    // Express divides by 5000, economy by 6000 — express bills more.
    expect(volumetricWeightKg(dimensions, 5000)).toBeGreaterThan(
      volumetricWeightKg(dimensions, 6000),
    );
  });
});

describe("levy cascade", () => {
  it("charges NHIL, GETFund and COVID on the post-duty base, and includes them in the VAT base", () => {
    // With zero freight, insurance, spread and margin, CIF is just the goods
    // value: US$1,000 at 10 GHS/USD = GH₵10,000 = 1,000,000 pesewas.
    const result = computeLandedCost(baseInput());
    expect(result.cif.minor).toBe(1_000_000);

    // Duty: 10% of CIF (ELECTRONICS band).
    expect(result.importDuty.minor).toBe(100_000);

    // CIF-based levies: ECOWAS 0.5%, AU 0.2%, EXIM 0.75%, inspection 1%, processing 0.4%.
    expect(result.ecowasLevy.minor).toBe(5_000);
    expect(result.auLevy.minor).toBe(2_000);
    expect(result.eximLevy.minor).toBe(7_500);
    expect(result.inspectionFee.minor).toBe(10_000);
    expect(result.processingFee.minor).toBe(4_000);

    // Pre-levy base = CIF + duty + all CIF-based levies.
    const preLevyBase =
      1_000_000 + 100_000 + 5_000 + 2_000 + 7_500 + 10_000 + 4_000;
    expect(preLevyBase).toBe(1_128_500);

    // The three cascading levies are charged on that base, NOT on CIF.
    expect(result.nhil.minor).toBe(Math.round(preLevyBase * 0.025)); // 28,213
    expect(result.getfund.minor).toBe(Math.round(preLevyBase * 0.025));
    expect(result.covidLevy.minor).toBe(Math.round(preLevyBase * 0.01)); // 11,285

    // VAT is 15% of (pre-levy base + those three levies).
    const vatBase =
      preLevyBase + result.nhil.minor + result.getfund.minor + result.covidLevy.minor;
    expect(result.vat.minor).toBe(Math.round(vatBase * 0.15));
  });

  it("would understate VAT if the cascading levies were left out of the VAT base", () => {
    const result = computeLandedCost(baseInput());
    const preLevyBase = 1_128_500;
    const naiveVat = Math.round(preLevyBase * 0.15);

    // The correct figure is higher, and the gap is the cost of getting it wrong.
    expect(result.vat.minor).toBeGreaterThan(naiveVat);
    const gap = result.vat.minor - naiveVat;
    // ~0.9% of CIF — small per unit, material at volume.
    expect(gap / result.cif.minor).toBeGreaterThan(0.008);
    expect(gap / result.cif.minor).toBeLessThan(0.011);
  });

  it("uses the statutory rates from GHANA_LEVIES", () => {
    expect(GHANA_LEVIES.VAT_BPS).toBe(1_500);
    expect(GHANA_LEVIES.NHIL_BPS + GHANA_LEVIES.GETFUND_BPS + GHANA_LEVIES.COVID_BPS).toBe(600);
  });

  it("honours a levy override so a budget change is a data edit", () => {
    const standard = computeLandedCost(baseInput());
    const raised = computeLandedCost(baseInput({ levyOverrides: { VAT_BPS: 1_750 } }));
    expect(raised.vat.minor).toBeGreaterThan(standard.vat.minor);
  });
});

describe("duty", () => {
  it("applies the band rate and flags the quote as estimated", () => {
    const result = computeLandedCost(baseInput({ dutyBand: "APPLIANCES" }));
    expect(result.importDuty.minor).toBe(200_000); // 20% of 1,000,000
    expect(result.estimated).toBe(true);
    expect(result.assumptions.some((a) => a.includes("APPLIANCES"))).toBe(true);
  });

  it("computing carries a zero duty rate under the ICT concession", () => {
    const result = computeLandedCost(baseInput({ dutyBand: "COMPUTING" }));
    expect(result.importDuty.minor).toBe(0);
  });

  it("lets an explicit HS-code rate override the band", () => {
    const result = computeLandedCost(
      baseInput({ dutyBand: "APPLIANCES", dutyBpsOverride: 500 }),
    );
    expect(result.importDuty.minor).toBe(50_000); // 5%, not the band's 20%
    // An explicit rate means the duty is no longer a guess; the only remaining
    // estimate is the tariff-table freight rate.
    expect(result.assumptions.some((a) => a.includes("APPLIANCES"))).toBe(false);
  });
});

describe("itemisation", () => {
  it("has lines that sum exactly to the total", () => {
    const result = computeLandedCost(
      baseInput({
        fxSpreadBps: 250,
        marginBps: 1_200,
        insuranceBps: 60,
        tariff: { perKgMinor: 1_350, handlingMinor: 3_500, minimumMinor: 8_500 },
      }),
    );
    const lineTotal = sum(
      result.lines.map((line) => line.amount),
      "GHS",
    );
    expect(lineTotal.minor).toBe(result.total.minor);
  });

  it("reports a landed-cost multiple over the goods value", () => {
    const result = computeLandedCost(baseInput({ dutyBand: "FASHION" }));
    const multiple = landedCostMultiple(result);
    expect(multiple).toBeGreaterThan(1);
    expect(multiple).toBeLessThan(2);
  });
});

describe("quantity and origin", () => {
  it("scales the goods value linearly with quantity", () => {
    const one = computeLandedCost(baseInput({ quantity: 1 }));
    const three = computeLandedCost(baseInput({ quantity: 3 }));
    expect(three.goodsValue.minor).toBe(one.goodsValue.minor * 3);
  });

  it("scales actual weight linearly with quantity", () => {
    const one = computeLandedCost(baseInput({ quantity: 1 }));
    const three = computeLandedCost(baseInput({ quantity: 3 }));
    expect(three.actualWeightKg).toBe(one.actualWeightKg * 3);
  });

  it("charges the FX spread only on the foreign-currency portion", () => {
    const withSpread = computeLandedCost(baseInput({ fxSpreadBps: 250 }));
    expect(withSpread.fxSpread.minor).toBe(Math.round(withSpread.goodsValue.minor * 0.025));
  });

  it("rejects a non-positive quantity", () => {
    expect(() => computeLandedCost(baseInput({ quantity: 0 }))).toThrow(RangeError);
  });

  it("rejects a non-positive FX rate", () => {
    expect(() => computeLandedCost(baseInput({ fxRate: 0 }))).toThrow(RangeError);
  });
});

describe("freight", () => {
  it("applies the tariff minimum when the computed charge is lower", () => {
    const result = computeLandedCost(
      baseInput({ tariff: { perKgMinor: 100, handlingMinor: 0, minimumMinor: 50_000 } }),
    );
    expect(result.internationalFreight.minor).toBe(50_000);
  });

  it("bills sea freight by volume rather than weight", () => {
    const result = computeLandedCost(
      baseInput({
        freightMode: "sea-lcl",
        tariff: {
          perKgMinor: 999_999,
          perCbmMinor: 280_000,
          handlingMinor: 0,
          minimumMinor: 0,
        },
      }),
    );
    // 40x30x10cm = 0.012 CBM at GH₵2,800/CBM = GH₵33.60 = 3,360 pesewas.
    expect(result.internationalFreight.minor).toBe(3_360);
    expect(result.assumptions.some((a) => a.includes("CBM"))).toBe(true);
  });

  it("gives sea a longer ETA than air express", () => {
    const sea = computeLandedCost(baseInput({ freightMode: "sea-lcl" }));
    const express = computeLandedCost(baseInput({ freightMode: "air-express" }));
    expect(sea.etaDays[0]).toBeGreaterThan(express.etaDays[1]);
  });
});
