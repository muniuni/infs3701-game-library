// Timestamped request log for the S4 failover and AZ-loss tests (§7).
//
//   node infra/evidence/probe.mjs <https://alb-dns> <log.tsv> [interval-ms]
//   node infra/evidence/probe.mjs --summary <log.tsv>
//
// Sends one request every interval (default 250 ms) on a fixed schedule, not
// waiting for the previous one, so a slow or dead target can't hide failures by
// slowing the probe down. Requests alternate between /api/health (shallow, no
// database) and /api/games (reads RDS), so an RDS failover shows up too.
// Each line: epoch ms, local time, seq, path, status (or ERR:<code>), latency,
// instance ID and AZ from X-Served-By. Ctrl-C stops it and prints the summary.
import https from "node:https";
import { createWriteStream, existsSync, readFileSync } from "node:fs";

const PATHS = ["/api/health", "/api/games"];
const TIMEOUT_MS = 10_000;
const COLUMNS = ["epoch_ms", "time", "seq", "path", "status", "ms", "instance", "az"];

function localTime(date) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${sign}${pad(Math.floor(Math.abs(offset) / 60))}${pad(Math.abs(offset) % 60)}`
  );
}
const clock = (ms) => localTime(new Date(ms)).slice(11, 23);
const ok = (status) => status === "200";

function summarize(file) {
  const rows = readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => Object.fromEntries(line.split("\t").map((v, i) => [COLUMNS[i], v])))
    .map((row) => ({ ...row, at: Number(row.epoch_ms) }))
    // Lines are written on completion; a 10 s timeout lands after later requests.
    .sort((a, b) => a.at - b.at);
  if (!rows.length) return console.log("no requests logged");
  const out = [];
  const failed = rows.filter((r) => !ok(r.status));
  const span = (rows.at(-1).at - rows[0].at) / 1000;
  out.push(`Log ${file}`);
  out.push(`${clock(rows[0].at)} → ${clock(rows.at(-1).at)} (${span.toFixed(0)} s), ${rows.length} requests`);
  out.push(
    `Failed ${failed.length}/${rows.length} (${((100 * failed.length) / rows.length).toFixed(2)}%)`,
  );
  for (const path of PATHS) {
    const all = rows.filter((r) => r.path === path);
    const bad = all.filter((r) => !ok(r.status));
    out.push(`  ${path.padEnd(12)} failed ${bad.length}/${all.length}`);
  }

  // Failure windows: failures less than 10 s apart belong to the same window.
  const windows = [];
  for (const row of failed) {
    const last = windows.at(-1);
    if (last && row.at - last.end <= 10_000) {
      last.end = row.at;
      last.rows.push(row);
    } else windows.push({ start: row.at, end: row.at, rows: [row] });
  }
  if (windows.length) out.push("", "Failure windows (failures < 10 s apart grouped):");
  for (const w of windows) {
    const total = rows.filter((r) => r.at >= w.start && r.at <= w.end).length;
    const statuses = {};
    for (const r of w.rows) statuses[`${r.path} ${r.status}`] = (statuses[`${r.path} ${r.status}`] ?? 0) + 1;
    out.push(
      `  ${clock(w.start)} → ${clock(w.end)} (${((w.end - w.start) / 1000).toFixed(1)} s): ` +
        `${w.rows.length} failed of ${total} sent in the window`,
    );
    for (const [key, count] of Object.entries(statuses)) out.push(`      ${count} × ${key}`);
  }

  // Which instance served what, and when each one was first and last seen.
  const instances = new Map();
  for (const r of rows) {
    if (!r.instance) continue;
    const entry = instances.get(r.instance) ?? { az: r.az, count: 0, first: r.at, last: r.at };
    entry.count += 1;
    entry.last = r.at;
    instances.set(r.instance, entry);
  }
  out.push("", "Served by (first and last successful or failed response with the header):");
  for (const [id, e] of [...instances].sort((a, b) => a[1].first - b[1].first)) {
    out.push(`  ${id} ${e.az.padEnd(11)} ${String(e.count).padStart(6)} requests  ${clock(e.first)} → ${clock(e.last)}`);
  }
  console.log(out.join("\n"));
}

function probe(baseUrl, file, intervalMs) {
  const base = baseUrl.replace(/\/$/, "");
  if (!base.startsWith("https://")) throw new Error("base URL must be https://<alb-dns>");
  // Self-signed ALB certificate (D10). Keep-alive like a browser.
  const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false, maxSockets: 64 });
  const fresh = !existsSync(file);
  const log = createWriteStream(file, { flags: "a" });
  if (fresh) log.write(`${COLUMNS.join("\t")}\n`);

  let seq = 0;
  let inFlight = 0;
  let stopping = false;
  let tally = { ok: 0, failed: 0, by: {} };

  const send = () => {
    const n = ++seq;
    const path = PATHS[n % PATHS.length];
    const at = Date.now();
    const started = performance.now();
    let done = false;
    inFlight += 1;
    const finish = (status, servedBy = "") => {
      if (done) return;
      done = true;
      inFlight -= 1;
      const [instance = "", az = ""] = servedBy.split(" ");
      const ms = Math.round(performance.now() - started);
      log.write(`${[at, localTime(new Date(at)), n, path, status, ms, instance, az].join("\t")}\n`);
      if (ok(status)) tally.ok += 1;
      else {
        tally.failed += 1;
        console.log(`${clock(at)}  FAIL ${path} ${status} ${ms} ms ${servedBy}`);
      }
      if (instance) tally.by[`${instance} ${az}`] = (tally.by[`${instance} ${az}`] ?? 0) + 1;
    };
    const request = https.get(
      `${base}${path}`,
      { agent, timeout: TIMEOUT_MS, headers: { "cache-control": "no-cache" } },
      (response) => {
        response.resume();
        response.on("end", () => finish(String(response.statusCode), response.headers["x-served-by"] ?? ""));
        response.on("error", (error) => finish(`ERR:${error.code ?? "RESPONSE"}`));
      },
    );
    request.on("timeout", () => request.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" })));
    request.on("error", (error) => finish(`ERR:${error.code ?? error.message}`));
  };

  console.log(`probe: ${base} every ${intervalMs} ms → ${file} (Ctrl-C to stop)`);
  const timer = setInterval(send, intervalMs);
  const status = setInterval(() => {
    const by = Object.entries(tally.by)
      .map(([key, count]) => `${key} ${count}`)
      .join(", ");
    console.log(`${clock(Date.now())}  ok ${tally.ok}  failed ${tally.failed}  | ${by}`);
    tally = { ok: 0, failed: 0, by: {} };
  }, 10_000);

  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    clearInterval(timer);
    clearInterval(status);
    console.log(`\nprobe: stopping, waiting for ${inFlight} request(s) in flight…`);
    const wait = setInterval(() => {
      if (inFlight > 0) return;
      clearInterval(wait);
      agent.destroy();
      log.end(() => {
        console.log("");
        summarize(file);
        process.exit(0);
      });
    }, 100);
  });
}

const args = process.argv.slice(2);
if (args[0] === "--summary" && args[1]) summarize(args[1]);
else if (args.length >= 2) probe(args[0], args[1], Number(args[2] ?? 250));
else {
  console.error("usage: probe.mjs <https://alb-dns> <log.tsv> [interval-ms] | --summary <log.tsv>");
  process.exit(2);
}
