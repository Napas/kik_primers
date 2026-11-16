// Headless Chrome for screenshots and smoke tests: the binary, the shared flags, and a run in a temp profile.

/** The Chrome binary: $PRIMER_CHROME_BIN, else the macOS app. */
export const CHROME = Deno.env.get("PRIMER_CHROME_BIN") ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Flags for headless Chrome with software WebGL in a w×h window and `profile`, then the caller's `extra`. */
export function headlessArgs({ w, h, profile, extra = [] }: { w: number; h: number; profile: string; extra?: string[] }): string[] {
  return [
    "--headless=new",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--window-size=${w},${h}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...extra,
  ];
}

/** Runs fn(profile) with a fresh temp profile directory, removed afterwards. */
export async function withProfile<T>(fn: (profile: string) => Promise<T>): Promise<T> {
  const profile = await Deno.makeTempDir();
  try {
    return await fn(profile);
  } finally {
    await Deno.remove(profile, { recursive: true }).catch(() => {});
  }
}

/** Runs Chrome with args(profile) in a fresh temp profile; rejects after `timeout` ms. */
export function runChrome(
  args: (profile: string) => string[],
  { timeout = 60_000, bin = CHROME }: { timeout?: number; bin?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return withProfile(async (profile) => {
    const signal = AbortSignal.timeout(timeout);
    const out = await new Deno.Command(bin, { args: args(profile), stdout: "piped", stderr: "piped", signal }).output();
    if (signal.aborted) throw new Error(`chrome timed out after ${timeout} ms`); // a killed Chrome can exit 0
    const text = (b: Uint8Array) => new TextDecoder().decode(b);
    return { code: out.code, stdout: text(out.stdout), stderr: text(out.stderr) };
  });
}
