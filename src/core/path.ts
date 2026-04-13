import { assertEquals } from "jsr:@std/assert";

export function joinUrl(base: string, ...parts: string[]): string {
    const rest = parts.join("/");
    return base.replace(/\/$/, "") + (rest.length > 0 ? "/" : "") + rest;
}

Deno.test("joinUrl", () => {
  assertEquals(joinUrl("https://example.com", "bar"), "https://example.com/bar")
  assertEquals(joinUrl("https://example.com/", "bar"), "https://example.com/bar")
  assertEquals(joinUrl("https://example.com/foo", "bar"), "https://example.com/foo/bar")
  assertEquals(joinUrl("https://example.com/foo/", "bar"), "https://example.com/foo/bar");
});
