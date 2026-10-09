import { describe, expect, it } from "vitest";
import { extractOutputText, isEmergency, localReply, validateReply } from "./chat";
import { isSafeWebUrl, telHref } from "./url";

describe("isEmergency", () => {
  it.each([
    "I'm feeling suicidal",
    "I can’t breathe",
    "I want to die",
    "thinking about self-harm",
    "my friend overdosed",
    "I want to end my life"
  ])("flags %s", (message) => {
    expect(isEmergency(message)).toBe(true);
  });

  it.each(["I need affordable dental care", "where can I end my search for food"])(
    "does not flag %s",
    (message) => {
      expect(isEmergency(message)).toBe(false);
    }
  );
});

describe("localReply", () => {
  it("includes 911 and 988 for emergencies", () => {
    const reply = localReply("I want to hurt myself", "94103");
    expect(reply.emergency).toBe(true);
    expect(reply.message).toContain("911");
    expect(reply.message).toContain("988");
    expect(reply.categories).toEqual(["emergency-care"]);
  });

  it("detects categories and ZIP codes", () => {
    const reply = localReply("I need a dental clinic near 10001", "94103");
    expect(reply.categories).toEqual(["dental"]);
    expect(reply.zip).toBe("10001");
  });

  it.each([
    ["I need affordable dental care", ["dental"]],
    ["Where can I get food today?", ["food"]],
    ["I need a safe place to sleep", ["shelter"]],
    ["need a prescription refill and a therapist", ["mental-health", "pharmacy"]],
    ["it's a great day", []],
    ["do I need the ER?", ["emergency-care"]],
    ["every error I get", []],
    ["I need a place to stay tonight", ["shelter"]]
  ])("maps %s to the right categories", (message, expected) => {
    expect(localReply(message, "94103").categories).toEqual(expected);
  });
});

describe("validateReply", () => {
  it("drops unknown categories and invalid ZIPs", () => {
    const reply = validateReply({ message: "ok", categories: ["dental", "bogus"], zip: "abc", emergency: false }, "94103");
    expect(reply).toEqual({ message: "ok", categories: ["dental"], zip: "94103", emergency: false });
  });

  it("adds crisis numbers when the model flags an emergency without them", () => {
    const reply = validateReply({ message: "Please get help.", categories: [], zip: "94103", emergency: true }, "94103");
    expect(reply.message).toContain("988");
  });

  it("handles null input", () => {
    expect(validateReply(null, "94103").categories).toEqual([]);
  });
});

describe("extractOutputText", () => {
  it("reads text from Responses API message output", () => {
    const body = {
      output: [
        { type: "reasoning", content: [] },
        { type: "message", content: [{ type: "output_text", text: '{"message":"hi"}' }] }
      ]
    };
    expect(extractOutputText(body)).toBe('{"message":"hi"}');
  });

  it("returns null for refusals or empty output", () => {
    expect(extractOutputText({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })).toBeNull();
    expect(extractOutputText({})).toBeNull();
  });
});

describe("url helpers", () => {
  it("only allows http(s) links", () => {
    expect(isSafeWebUrl("https://example.org")).toBe(true);
    expect(isSafeWebUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeWebUrl("not a url")).toBe(false);
  });

  it("builds tel links", () => {
    expect(telHref("(415) 555-2901")).toBe("tel:4155552901");
  });
});
