import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../auth/token";

const secret = "test-secret-for-unit-tests-only";

describe("session tokens", () => {
  it("round-trips a valid session", async () => {
    const token = await signSession({ sub: "tm-rand", exp: Date.now() + 60_000 }, secret);
    expect((await verifySession(token, secret))?.sub).toBe("tm-rand");
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession({ sub: "tm-rand", exp: Date.now() + 60_000 }, "other-secret");
    expect(await verifySession(token, secret)).toBeNull();
  });

  it("rejects a tampered token (someone swapping in another person)", async () => {
    const token = await signSession({ sub: "tm-anas", exp: Date.now() + 60_000 }, secret);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "tm-farouk", exp: Date.now() + 60_000 })).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`, secret)).toBeNull();
  });

  it("rejects expired, empty and malformed tokens", async () => {
    const expired = await signSession({ sub: "tm-rand", exp: Date.now() - 1 }, secret);
    expect(await verifySession(expired, secret)).toBeNull();
    expect(await verifySession(undefined, secret)).toBeNull();
    expect(await verifySession("not-a-token", secret)).toBeNull();
    expect(await verifySession("a.b", secret)).toBeNull();
  });
});
