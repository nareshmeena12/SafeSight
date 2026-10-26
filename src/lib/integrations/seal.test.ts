import { describe, expect, it } from "vitest";
import { seal, unseal } from "./seal";

describe("seal / unseal", () => {
  it("round-trips with the same secret", () => {
    const sealed = seal({ uid: "u1", token: "ya29.abc", exp: 123 }, "secret");
    expect(sealed).not.toContain("ya29");
    expect(unseal(sealed, "secret")).toEqual({ uid: "u1", token: "ya29.abc", exp: 123 });
  });

  it("rejects another secret, tampering and junk", () => {
    const sealed = seal({ a: 1 }, "secret");
    expect(unseal(sealed, "other")).toBeNull();
    const [iv, tag, body] = sealed.split(".");
    const flipped = body.slice(0, -2) + (body.endsWith("A") ? "B" : "A") + body.slice(-1);
    expect(unseal(`${iv}.${tag}.${flipped}`, "secret")).toBeNull();
    expect(unseal("nope", "secret")).toBeNull();
    expect(unseal(undefined, "secret")).toBeNull();
  });
});
