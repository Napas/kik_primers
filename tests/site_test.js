import { assertEquals } from "@std/assert";

Deno.test("validate passes on the real site/", async () => {
  const root = new URL("../", import.meta.url);
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "tools/validate.ts", "site"],
    cwd: root.pathname,
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(out.code, 0, new TextDecoder().decode(out.stderr));
});
