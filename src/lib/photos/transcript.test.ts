import { describe, expect, it } from "vitest";
import {
  cleanLines,
  cleanupCutoffs,
  editableToLines,
  isPhotoMessage,
  MAX_LINES,
  parseTranscriptionText,
  photoExpired,
  photoMessageText,
  sniffImageType,
} from "./transcript";

describe("cleanLines", () => {
  it("drops empty lines and the model's own numbering, keeps the student's mistakes", () => {
    expect(cleanLines(["1. P2 = 100 * 2^1.3", "", "  L2: W = -7.7 kJ ", "Line 3 - Q = W"])).toEqual([
      "P2 = 100 * 2^1.3",
      "W = -7.7 kJ",
      "Q = W",
    ]);
  });

  it("doesn't eat a leading number that is maths", () => {
    expect(cleanLines(["2x + 3 = 7", "10 kPa * 0.5 m^3"])).toEqual(["2x + 3 = 7", "10 kPa * 0.5 m^3"]);
  });

  it("caps line count and length", () => {
    const lines = cleanLines(Array.from({ length: 60 }, (_, i) => `x${i} ${"y".repeat(400)}`));
    expect(lines).toHaveLength(MAX_LINES);
    expect(lines[0].length).toBeLessThanOrEqual(300);
  });

  it("reads the edited text back one line per line", () => {
    expect(editableToLines("a = 1\n\n b = 2 \n")).toEqual(["a = 1", "b = 2"]);
  });
});

describe("photoMessageText", () => {
  it("numbers the lines so Sage can name the first wrong one", () => {
    const text = photoMessageText(["a = 1", "b = a + 2"], "");
    expect(isPhotoMessage(text)).toBe(true);
    expect(text).toContain("Line 1: a = 1\nLine 2: b = a + 2");
    expect(text).toMatch(/where it first goes wrong/);
  });

  it("keeps the student's own question and stays under the message limit", () => {
    const text = photoMessageText(Array.from({ length: 40 }, () => "z".repeat(300)), "Is my sign right?");
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(isPhotoMessage("Can you check this?")).toBe(false);
  });
});

describe("photoExpired", () => {
  const now = Date.parse("2026-11-30T00:00:00Z");
  it("removes sent photos after 30 days", () => {
    expect(photoExpired({ createdAt: "2026-10-31T00:00:01Z", sentAt: "2026-10-31T00:01:00Z" }, now)).toBe(false);
    expect(photoExpired({ createdAt: "2026-10-30T23:59:59Z", sentAt: "2026-10-31T00:01:00Z" }, now)).toBe(true);
  });

  it("removes photos that were never sent after a day", () => {
    expect(photoExpired({ createdAt: "2026-11-29T01:00:00Z", sentAt: null }, now)).toBe(false);
    expect(photoExpired({ createdAt: "2026-11-28T23:00:00Z", sentAt: null }, now)).toBe(true);
  });

  it("gives the clean-up query the same cut-offs", () => {
    expect(cleanupCutoffs(now)).toEqual({ sent: "2026-10-31T00:00:00.000Z", unsent: "2026-11-29T00:00:00.000Z" });
  });
});

describe("parseTranscriptionText", () => {
  it("finds the JSON inside a chatty reply", () => {
    expect(parseTranscriptionText('Sure!\n```json\n{"readable": true, "lines": ["a = 1"], "note": ""}\n```')).toEqual({
      readable: true,
      lines: ["a = 1"],
      note: "",
    });
  });
  it("returns null for anything else", () => {
    expect(parseTranscriptionText("I can't read this")).toBeNull();
    expect(parseTranscriptionText('{"lines": "a"}')).toBeNull();
  });
});

describe("sniffImageType", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
  });
  it("rejects other files, whatever their name", () => {
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});
