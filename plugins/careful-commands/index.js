// Careful commands: asks you to confirm before obviously destructive commands.
// A helper, not a security boundary: it sees what is on screen at the cursor
// and recognises common forms, not every way to write a command.
"use strict";

const PREFIXES = new Set(["sudo", "doas", "command", "nice", "time", "exec"]);
const CRITICAL = /^(\/|\/\*|~|~\/|~\/\*|\$HOME|\$HOME\/|\$HOME\/\*|\*|\/[a-z]+\/?\*?)$/;
const DISK = /^\/dev\/(sd[a-z]|nvme\d|vd[a-z]|hd[a-z]|xvd[a-z]|mmcblk\d)/;

/** Words of one shell segment, quotes removed. */
function words(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) =>
    w.replace(/^(["'])(.*)\1$/, "$2"),
  );
}

/** Drop sudo/doas/env FOO=1/… so the real command comes first. */
function strip(ws) {
  let i = 0;
  while (i < ws.length) {
    if (PREFIXES.has(ws[i])) i++;
    else if (ws[i] === "env") i++;
    else if (/^[A-Za-z_]\w*=/.test(ws[i])) i++;
    else if (/^-/.test(ws[i]) && i > 0 && PREFIXES.has(ws[i - 1])) i++;
    else break;
  }
  return ws.slice(i);
}

/** Short flags merged (-r -f ≡ -rf ≡ -fr) plus long flags. */
function flags(ws) {
  const short = new Set();
  const long = new Set();
  for (const w of ws) {
    if (w.startsWith("--")) long.add(w.slice(2));
    else if (/^-[A-Za-z]+$/.test(w)) for (const c of w.slice(1)) short.add(c);
  }
  return { short, long, args: ws.filter((w) => !w.startsWith("-")) };
}

function check(segment, whole) {
  const ws = strip(words(segment));
  const [exe, ...rest] = ws;
  if (!exe) return null;
  const f = flags(rest);
  if (exe === "rm") {
    const recursive = f.short.has("r") || f.short.has("R") || f.long.has("recursive");
    const target = f.args.find((a) => CRITICAL.test(a));
    if (recursive && target)
      return `rm -r on ${target} deletes everything under it.`;
  }
  if (exe === "dd") {
    const of = f.args.find((a) => a.startsWith("of="));
    if (of && DISK.test(of.slice(3)))
      return `dd writes straight to the disk ${of.slice(3)}.`;
  }
  if (/^mkfs(\.|$)/.test(exe)) return "mkfs erases the filesystem on that device.";
  if (exe === "chmod" && f.args.includes("777") && f.args.some((a) => a === "/" || a === "/*") && (f.short.has("R") || f.long.has("recursive")))
    return "chmod -R 777 / opens every file on the system.";
  if (exe === "git" && f.args[0] === "push") {
    const force = f.short.has("f") || f.long.has("force") || f.args.some((a) => a.startsWith("+"));
    if (force && f.args.some((a) => /^\+?(main|master)$/.test(a) || /:(main|master)$/.test(a)))
      return "git push --force rewrites the history of main/master.";
  }
  if (/^(curl|wget)$/.test(exe) && /\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/.test(whole))
    return `${exe} piped into a shell runs whatever that URL serves.`;
  if (/^(DROP|TRUNCATE)\b/i.test(ws.join(" ")) || /\bDROP\s+(DATABASE|SCHEMA)\b/i.test(segment))
    return "This drops a database or table.";
  return null;
}

/** Reason to pause this command line, or null. */
function careful(text) {
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(text))
    return "That is a fork bomb: it freezes the machine.";
  for (const raw of String(text).split("\n")) {
    // The screen line starts with the prompt; also try it without one.
    const noPrompt = raw.replace(/^.*?(?:[$#%>]|❯)\s+/, "");
    for (const line of new Set([raw, noPrompt])) {
      for (const seg of line.split(/&&|\|\||;|\|/)) {
        const reason = check(seg.trim(), line);
        if (reason) return reason;
      }
    }
  }
  return null;
}

if (typeof tdog !== "undefined") {
  tdog.onGate((line) => {
    const reason = careful(line);
    return reason ? { verdict: "confirm", reason } : { verdict: "allow" };
  });
}
