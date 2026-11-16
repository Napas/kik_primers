import { assert, assertEquals, assertRejects } from "@std/assert";
import { headlessArgs, runChrome } from "../tools/chrome.ts";

Deno.test("headlessArgs: headless software GL in the given window and profile, then the caller's flags", () => {
  const args = headlessArgs({ w: 800, h: 600, profile: "/tmp/p", extra: ["--dump-dom", "about:blank"] });
  for (const flag of ["--headless=new", "--use-angle=swiftshader", "--window-size=800,600", "--user-data-dir=/tmp/p", "--no-first-run"]) {
    assert(args.includes(flag), flag);
  }
  assertEquals(args.slice(-2), ["--dump-dom", "about:blank"]);
  assertEquals(headlessArgs({ w: 1, h: 1, profile: "x" }).at(-1), "--no-default-browser-check");
});

Deno.test("runChrome hands the args builder a fresh profile and removes it afterwards", async () => {
  let profile = "";
  const out = await runChrome((p) => {
    profile = p;
    return ["-c", "exit 0"];
  }, { bin: "/bin/sh" });
  assertEquals(out.code, 0);
  assert(profile.length > 0);
  assertEquals(await Deno.stat(profile).then(() => true, () => false), false, "profile removed");
});

Deno.test("runChrome rejects when the run outlives its timeout, so a cut-off run never reads as success", async () => {
  await assertRejects(() => runChrome(() => ["-c", "exec sleep 5"], { bin: "/bin/sh", timeout: 200 }), Error, "timed out after 200 ms");
});
