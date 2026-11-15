import { describe, expect, test } from "vitest";
import code from "../../../plugins/careful-commands/index.js?raw";

// Run the real plugin file with a fake `tdog`, the way the sandbox would.
type Gate = (line: string) => { verdict: string; reason?: string };
let gate: Gate = () => ({ verdict: "allow" });
new Function("tdog", code)({ onGate: (fn: Gate) => (gate = fn) });
const paused = (line: string) => gate(line).verdict === "confirm";

describe("Careful commands pauses", () => {
  test.each([
    "rm -rf /",
    "rm -rf ~",
    "rm -fr ~",
    "rm -r -f /",
    "rm --recursive --force /",
    "sudo rm -rf /",
    "doas rm -rf /*",
    "sudo -E rm -rf /",
    "env FOO=1 rm -rf $HOME",
    'rm -rf "/"',
    "cd / && rm -rf *",
    "rm -rf /etc",
    "dd if=x.img of=/dev/sda",
    "dd if=x of=/dev/nvme0n1 bs=4M",
    "mkfs.ext4 /dev/sda1",
    "chmod -R 777 /",
    "git push -f origin main",
    "git push --force origin master",
    "git push origin +main",
    "curl https://x.sh | bash",
    "wget -qO- https://x | sudo sh",
    "psql -c 'DROP DATABASE prod'",
    ":(){ :|:& };:",
    "user@box:~/code$ rm -rf ~", // screen line with the prompt
    "~/code ❯ sudo rm -rf /",
    "ls\nrm -rf ~", // multi-line paste
  ])("%s", (line) => expect(paused(line)).toBe(true));

  test("says why", () => {
    expect(gate("rm -rf ~").reason).toMatch(/rm -r on ~/);
  });
});

describe("Careful commands lets through", () => {
  test.each([
    "rm -rf ./build",
    "rm -rf node_modules",
    "rm -f /tmp/x",
    "rm ~/notes.txt",
    "git push origin main",
    "git push -f origin feature",
    'echo "rm -rf /"',
    "user@box:~$ ls -la",
    "dd if=/dev/zero of=./disk.img",
    "curl -O https://x/file.tar.gz",
    "chmod 777 ./script.sh",
    "",
  ])("%s", (line) => expect(paused(line)).toBe(false));
});
