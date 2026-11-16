import { assertEquals, assertMatch } from "@std/assert";

const root = new URL("../", import.meta.url).pathname;
const validate = async (dir, ...extra) => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "tools/validate.ts", dir, ...extra],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code: out.code, err: new TextDecoder().decode(out.stderr) };
};

Deno.test("validate passes on the real site/", async () => {
  const { code, err } = await validate("site");
  assertEquals(code, 0, err);
});

Deno.test("validate fails on a forbidden file name and a slug that differs from its folder", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${dir}/topics/other`, { recursive: true });
    await Deno.copyFile(`${root}tests/fixtures/mini/topic.json`, `${dir}/topics/other/topic.json`);
    await Deno.writeTextFile(`${dir}/kik.txt`, "x");
    const { code, err } = await validate(dir);
    assertEquals(code, 1);
    assertMatch(err, /slug mini-test must equal folder name other/);
    assertMatch(err, /kik\.txt: forbidden term/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("validate reports an unreadable file", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/a.html`, "x");
    await Deno.chmod(`${dir}/a.html`, 0o000);
    const { code, err } = await validate(dir);
    assertEquals(code, 1);
    assertMatch(err, /a\.html: cannot read/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
