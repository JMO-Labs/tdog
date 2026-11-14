/** Bundled, deterministic bench fixture (ADR-0001 spike). */
export const SECTIONS = ["colors", "nerdfont", "ligatures", "htop"] as const;

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

function colors(): string {
  let s = "";
  for (let i = 0; i < 256; i++)
    s += `${ESC}38;5;${i}m${String(i).padStart(4)}${i % 16 === 15 ? "\r\n" : ""}`;
  s += RESET;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
      const r = Math.round((x / 79) * 255);
      const g = Math.round((y / 23) * 255);
      s += `${ESC}48;2;${r};${g};${255 - r}m `;
    }
    s += `${RESET}\r\n`;
  }
  return s;
}

const NERD = ["", "", "", "", "", "", "", "", "", "", "󰄉", ""];

function nerdfont(): string {
  let s = "";
  for (let i = 0; i < 40; i++)
    s += `${ESC}44m ${NERD[i % NERD.length]} main ${ESC}34;42m${ESC}30m ~/src/tdog ${RESET}${ESC}32m${RESET} ${NERD.join(" ")}\r\n`;
  return s;
}

const LIGS =
  "=> -> <- <=> != !== === >= <= |> <| :: ++ && || ... /* */ // ### www 0xFF";

function ligatures(): string {
  let s = "";
  for (let i = 0; i < 40; i++)
    s += `const f${i} = (a) => a !== b && c >= d ? x |> y : z; // ${LIGS}\r\n`;
  return s;
}

function htop(frames = 60, rows = 30, cols = 80): string {
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  let s = `${ESC}?1049h${ESC}2J`;
  for (let f = 0; f < frames; f++) {
    s += `${ESC}H`;
    for (let r = 1; r <= rows; r++) {
      s += `${ESC}${r};1H`;
      if (r <= 4) {
        const n = Math.round(rnd() * 40);
        s += `${r - 1}[${ESC}32m${"|".repeat(n)}${ESC}31m${"|".repeat(Math.round(n / 4))}${RESET}`;
        s += `${" ".repeat(Math.max(0, cols - 60 - Math.round(n / 4)))}${(rnd() * 100).toFixed(1)}%]`;
      } else {
        const pid = 1000 + r * 7;
        const cpu = (rnd() * 100).toFixed(1).padStart(5);
        const line = `${pid} user  20 0 ${Math.round(rnd() * 9e5)} S ${cpu} 0.3 0:0${f % 10}.00 /usr/bin/proc-${r}`;
        s +=
          (r === 5 ? `${ESC}30;46m` : "") +
          line.padEnd(cols).slice(0, cols) +
          RESET;
      }
    }
  }
  return s + `${ESC}?1049l`;
}

export function buildFixture(): Uint8Array {
  return new TextEncoder().encode(
    colors() + nerdfont() + ligatures() + htop() + RESET,
  );
}
