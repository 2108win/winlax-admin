import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

type Terminal = {
  id: string;
  email: string;
  child: ChildProcess;
  createdAt: number;
  lastActive: number;
  buffer: string;
  exited: boolean;
  listeners: Set<(event: { data?: string; exit?: number }) => void>;
};

const IDLE_MS = 30 * 60_000;
const MAX_BUFFER = 200_000;
const MAX_TERMINALS = 5;

const globalForTerminals = globalThis as unknown as {
  terminals?: Map<string, Terminal>;
  terminalSweeper?: ReturnType<typeof setInterval>;
};
const terminals = (globalForTerminals.terminals ??= new Map());
globalForTerminals.terminalSweeper ??= setInterval(() => {
  for (const terminal of terminals.values()) {
    if (Date.now() - terminal.lastActive > IDLE_MS) closeTerminal(terminal.id);
  }
}, 60_000);

/**
 * A login shell as root with a minimal environment (none of this app's
 * secrets), in a pseudo-terminal provided by bin/pty-bridge.py.
 */
export async function openTerminal(email: string, cols: number, rows: number): Promise<string> {
  if (terminals.size >= MAX_TERMINALS) throw new Error(`Đã mở tối đa ${MAX_TERMINALS} terminal.`);
  // No NODE_ENV on purpose: `npm ci` typed in this shell must still install devDependencies.
  const shellEnv = {
    HOME: "/root",
    USER: "root",
    LOGNAME: "root",
    SHELL: "/bin/bash",
    TERM: "xterm-256color",
    LANG: "C.UTF-8",
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  } as unknown as NodeJS.ProcessEnv;
  const child: ChildProcess = spawn("python3", [path.join(process.cwd(), "bin/pty-bridge.py"), String(cols), String(rows)], {
    cwd: "/root",
    stdio: ["pipe", "pipe", "ignore", "pipe"],
    env: shellEnv,
  });
  const id = randomBytes(16).toString("hex");
  const terminal: Terminal = {
    id,
    email,
    child,
    createdAt: Date.now(),
    lastActive: Date.now(),
    buffer: "",
    exited: false,
    listeners: new Set(),
  };
  const decoder = new StringDecoder("utf8");
  child.stdout?.on("data", (chunk: Buffer) => {
    const data = decoder.write(chunk);
    if (!data) return;
    terminal.buffer = (terminal.buffer + data).slice(-MAX_BUFFER);
    for (const listener of terminal.listeners) listener({ data });
  });
  child.on("error", (error: Error) => {
    terminal.buffer += `\r\nKhông chạy được shell: ${error.message}\r\n`;
    terminal.exited = true;
  });
  child.on("exit", (code: number | null) => {
    terminal.exited = true;
    for (const listener of terminal.listeners) listener({ exit: code ?? 0 });
    setTimeout(() => terminals.delete(id), 60_000);
  });
  terminals.set(id, terminal);
  return id;
}

export function getTerminal(id: string): Terminal | null {
  return terminals.get(id) ?? null;
}

export function listTerminals() {
  return [...terminals.values()].map(({ id, email, createdAt, lastActive, exited }) => ({ id, email, createdAt, lastActive, exited }));
}

export function writeTerminal(id: string, input: string) {
  const terminal = terminals.get(id);
  if (!terminal || terminal.exited) return false;
  terminal.lastActive = Date.now();
  terminal.child.stdin?.write(input);
  return true;
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  const terminal = terminals.get(id);
  if (!terminal || terminal.exited) return false;
  const size = `${Math.max(10, Math.min(cols, 500))} ${Math.max(5, Math.min(rows, 200))}\n`;
  (terminal.child.stdio[3] as Writable | null)?.write(size);
  return true;
}

export function closeTerminal(id: string) {
  const terminal = terminals.get(id);
  if (!terminal) return false;
  if (!terminal.exited) terminal.child.kill("SIGHUP");
  terminals.delete(id);
  return true;
}
