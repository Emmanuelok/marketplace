import { describe, expect, it } from "vitest";

import {
  GHANA_REGIONS,
  detectMomoNetwork,
  formatGhanaPhone,
  freightEtaDays,
  isValidDigitalAddress,
  parseDigitalAddress,
  parseGhanaPhone,
  regionByCode,
} from "./ghana";

describe("regions", () => {
  it("covers all 16 post-2019 regions", () => {
    expect(GHANA_REGIONS).toHaveLength(16);
  });

  it("has unique codes", () => {
    const codes = new Set(GHANA_REGIONS.map((r) => r.code));
    expect(codes.size).toBe(GHANA_REGIONS.length);
  });

  it("looks up case-insensitively", () => {
    expect(regionByCode("ga")?.name).toBe("Greater Accra");
    expect(regionByCode("AH")?.capital).toBe("Kumasi");
    expect(regionByCode("ZZ")).toBeUndefined();
  });
});

describe("GhanaPost GPS digital addresses", () => {
  it("parses the canonical hyphenated form", () => {
    const parsed = parseDigitalAddress("GA-543-0125");
    expect(parsed).not.toBeNull();
    expect(parsed?.regionCode).toBe("GA");
    expect(parsed?.districtCode).toBe("543");
    expect(parsed?.uniqueCode).toBe("0125");
    expect(parsed?.formatted).toBe("GA-543-0125");
  });

  it("accepts the form without hyphens and normalises it", () => {
    expect(parseDigitalAddress("GA5430125")?.formatted).toBe("GA-543-0125");
  });

  it("is tolerant of case and internal whitespace", () => {
    expect(parseDigitalAddress(" ga-543-0125 ")?.formatted).toBe("GA-543-0125");
    expect(parseDigitalAddress("AH 129 4471")?.formatted).toBe("AH-129-4471");
  });

  it("rejects a prefix that is not a real region", () => {
    // Well-formed shape, but ZZ is not a Ghanaian region — a typo, not an address.
    expect(parseDigitalAddress("ZZ-543-0125")).toBeNull();
  });

  it("rejects malformed shapes", () => {
    expect(parseDigitalAddress("GA-54-0125")).toBeNull();
    expect(parseDigitalAddress("GA-543-012")).toBeNull();
    expect(parseDigitalAddress("")).toBeNull();
    expect(isValidDigitalAddress("not an address")).toBe(false);
  });
});

describe("phone numbers", () => {
  it("accepts every common input format", () => {
    const expected = "+233241234567";
    expect(parseGhanaPhone("+233241234567")?.e164).toBe(expected);
    expect(parseGhanaPhone("233241234567")?.e164).toBe(expected);
    expect(parseGhanaPhone("0241234567")?.e164).toBe(expected);
    expect(parseGhanaPhone("241234567")?.e164).toBe(expected);
    expect(parseGhanaPhone("024 123 4567")?.e164).toBe(expected);
    expect(parseGhanaPhone("+233 (0) 24-123-4567")?.e164).toBe(expected);
  });

  it("returns the national form alongside E.164", () => {
    expect(parseGhanaPhone("+233241234567")?.national).toBe("0241234567");
  });

  it("rejects numbers that are not Ghanaian mobiles", () => {
    expect(parseGhanaPhone("0301234567")).toBeNull(); // landline prefix
    expect(parseGhanaPhone("12345")).toBeNull();
    expect(parseGhanaPhone("+441234567890")).toBeNull();
    expect(parseGhanaPhone("")).toBeNull();
  });

  it("formats for display", () => {
    expect(formatGhanaPhone("+233241234567")).toBe("024 123 4567");
    expect(formatGhanaPhone("nonsense")).toBeNull();
  });
});

describe("mobile-money network detection", () => {
  it("identifies MTN ranges", () => {
    for (const prefix of ["024", "054", "055", "059"]) {
      expect(detectMomoNetwork(`${prefix}1234567`)?.id).toBe("mtn");
    }
  });

  it("identifies Telecel ranges, which Vodafone Ghana became in 2023", () => {
    expect(detectMomoNetwork("0201234567")?.id).toBe("telecel");
    expect(detectMomoNetwork("0501234567")?.shortName).toBe("Telecel");
  });

  it("identifies AirtelTigo ranges, trading as AT", () => {
    expect(detectMomoNetwork("0271234567")?.id).toBe("airteltigo");
    expect(detectMomoNetwork("0571234567")?.id).toBe("airteltigo");
  });

  it("returns null for an unrecognised number", () => {
    expect(detectMomoNetwork("0301234567")).toBeNull();
  });

  it("maps each network to a Paystack provider code", () => {
    expect(detectMomoNetwork("0241234567")?.paystackBank).toBe("MTN");
    expect(detectMomoNetwork("0201234567")?.paystackBank).toBe("VOD");
    expect(detectMomoNetwork("0271234567")?.paystackBank).toBe("ATL");
  });
});

describe("freight ETAs", () => {
  it("includes customs clearance in the window", () => {
    const [min, max] = freightEtaDays("air-express");
    // 3-6 transit + 1-2 clearance
    expect(min).toBe(4);
    expect(max).toBe(8);
  });

  it("orders the modes by speed", () => {
    expect(freightEtaDays("air-express")[1]).toBeLessThan(freightEtaDays("air-economy")[1]);
    expect(freightEtaDays("air-economy")[1]).toBeLessThan(freightEtaDays("sea-lcl")[1]);
  });
});
