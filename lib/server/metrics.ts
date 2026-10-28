import { X509Certificate } from "node:crypto";
import { readdir, readFile, stat, statfs } from "node:fs/promises";
import os from "node:os";

type CpuSample = { total: number; idle: number };
type NetSample = { at: number; rx: number; tx: number };

const globalForMetrics = globalThis as unknown as {
  lastCpu?: CpuSample;
  lastNet?: NetSample;
};

async function cpuSample(): Promise<CpuSample> {
  const line = (await readFile("/proc/stat", "utf8")).split("\n")[0];
  const values = line.split(/\s+/).slice(1).map(Number);
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  return { total: values.reduce((sum, value) => sum + value, 0), idle };
}

async function cpuPercent(): Promise<number> {
  let previous = globalForMetrics.lastCpu;
  if (!previous) {
    previous = await cpuSample();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const current = await cpuSample();
  globalForMetrics.lastCpu = current;
  const total = current.total - previous.total;
  return total > 0 ? Math.round((1 - (current.idle - previous.idle) / total) * 1000) / 10 : 0;
}

async function memory() {
  const info: Record<string, number> = {};
  for (const line of (await readFile("/proc/meminfo", "utf8")).split("\n")) {
    const match = line.match(/^(\w+):\s+(\d+)/);
    if (match) info[match[1]] = Number(match[2]) * 1024;
  }
  return {
    total: info.MemTotal ?? 0,
    available: info.MemAvailable ?? 0,
    swapTotal: info.SwapTotal ?? 0,
    swapFree: info.SwapFree ?? 0,
  };
}

async function network() {
  const lines = (await readFile("/proc/net/dev", "utf8")).split("\n").slice(2);
  let rx = 0;
  let tx = 0;
  for (const line of lines) {
    const [name, rest] = line.split(":");
    if (!rest || name.trim() === "lo") continue;
    const cols = rest.trim().split(/\s+/).map(Number);
    rx += cols[0] ?? 0;
    tx += cols[8] ?? 0;
  }
  const now = { at: Date.now(), rx, tx };
  const previous = globalForMetrics.lastNet;
  globalForMetrics.lastNet = now;
  const seconds = previous ? (now.at - previous.at) / 1000 : 0;
  return {
    rxTotal: rx,
    txTotal: tx,
    rxPerSec: previous && seconds > 0 ? Math.max(0, (rx - previous.rx) / seconds) : 0,
    txPerSec: previous && seconds > 0 ? Math.max(0, (tx - previous.tx) / seconds) : 0,
  };
}

export async function systemMetrics() {
  const [cpu, mem, net, disk, loadavg, uptime] = await Promise.all([
    cpuPercent(),
    memory(),
    network(),
    statfs("/"),
    readFile("/proc/loadavg", "utf8"),
    readFile("/proc/uptime", "utf8"),
  ]);
  return {
    hostname: os.hostname(),
    kernel: os.release(),
    cpus: os.cpus().length,
    cpuPercent: cpu,
    load: loadavg.split(" ").slice(0, 3).map(Number),
    uptimeSeconds: Number(uptime.split(" ")[0]),
    memory: mem,
    disk: { total: disk.blocks * disk.bsize, free: disk.bavail * disk.bsize },
    network: net,
  };
}

export async function certificates() {
  const dir = "/etc/letsencrypt/live";
  const names = (await readdir(dir).catch(() => [])).filter((name) => name !== "README");
  return Promise.all(
    names.map(async (name) => {
      try {
        const cert = new X509Certificate(await readFile(`${dir}/${name}/cert.pem`));
        return { name, domains: cert.subjectAltName?.replace(/DNS:/g, "") ?? "", validTo: new Date(cert.validTo).toISOString() };
      } catch {
        return { name, domains: "", validTo: null };
      }
    }),
  );
}

export async function latestBackups() {
  const dir = "/var/backups/postgres";
  const dbs = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory());
  return Promise.all(
    dbs.map(async ({ name }) => {
      const files = (await readdir(`${dir}/${name}`)).filter((file) => file.endsWith(".dump")).sort();
      const latest = files.at(-1);
      if (!latest) return { db: name, file: null, size: 0, at: null, count: 0 };
      const info = await stat(`${dir}/${name}/${latest}`);
      return { db: name, file: latest, size: info.size, at: info.mtime.toISOString(), count: files.length };
    }),
  );
}
