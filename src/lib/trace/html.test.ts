import { describe, expect, it } from "vitest";
import { measureHtml } from "./html";

describe("measureHtml", () => {
  it("counts visible characters and pasted ones", () => {
    const html =
      '<p>Hello world</p><p><span data-trace-paste="">Pasted <strong>bold</strong> text</span> typed</p>';
    expect(measureHtml(html)).toEqual({ chars: 10 + 6 + 4 + 4 + 5, pastedChars: 6 + 4 + 4 });
  });

  it("handles nested spans and entities", () => {
    const html = '<p><span data-trace-paste=""><span class="x">a&amp;b</span>c</span>d&nbsp;e</p>';
    expect(measureHtml(html)).toEqual({ chars: 6, pastedChars: 4 });
  });

  it("returns zeros for an empty document", () => {
    expect(measureHtml("<p></p>")).toEqual({ chars: 0, pastedChars: 0 });
  });
});
