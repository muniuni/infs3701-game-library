// Capacity measurement for one t3.small (docs/GROUP_ARCHITECTURE.md, D6).
//
//   k6 run -e BASE_URL=https://<alb-dns> infra/load/capacity.js
//
// Hold the group at 2 instances first (suspend AlarmNotification), otherwise
// target tracking scales out mid-test and the per-instance numbers are wrong.
//
// Open-model staircase: k6 sends a fixed number of requests per second at each
// step, whatever the latency, so a saturated app shows up as rising latency and
// errors instead of a silently lower rate. One iteration = one HTTP request, so
// the step rate equals the ALB RequestCount rate.
//
// Request mix (realistic page use): 50% the library page "/", 30% /api/games,
// 20% an uploaded cover via /api/covers/:id (S3 through the app). Add at least
// one game with an uploaded cover before running; without one, the cover share
// goes to "/".
//
// Options (environment variables):
//   STEPS     request rates per second, comma-separated (default below)
//   STEP_MIN  minutes to hold each step (default 3; CloudWatch needs >= 2 points)
//   RAMP_SEC  seconds to ramp between steps (default 30; not counted in results)
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/$/, "");
if (!BASE_URL.startsWith("https://")) throw new Error("Set -e BASE_URL=https://<alb-dns>");
const STEPS = (__ENV.STEPS || "5,10,20,30,45,60,80,100").split(",").map(Number);
const STEP_MIN = Number(__ENV.STEP_MIN || 3);
const RAMP_SEC = Number(__ENV.RAMP_SEC || 30);
const HOLD_SEC = STEP_MIN * 60;

const stages = [];
for (const rate of STEPS) {
  stages.push({ target: rate, duration: `${RAMP_SEC}s` });
  stages.push({ target: rate, duration: `${HOLD_SEC}s` });
}

// One threshold per step only so k6 reports per-step sub-metrics in the
// summary. The 1 s p95 matches D6's saturation rule; it is evaluated, not enforced.
const thresholds = {
  // Stop if things are clearly broken: >20% errors over the whole run.
  http_req_failed: [{ threshold: "rate<0.2", abortOnFail: true, delayAbortEval: "1m" }],
};
STEPS.forEach((_, i) => {
  thresholds[`http_req_duration{step:${i + 1}}`] = ["p(95)<1000"];
  thresholds[`http_req_failed{step:${i + 1}}`] = ["rate<0.01"];
  thresholds[`http_reqs{step:${i + 1}}`] = ["count>=0"];
});

export const options = {
  insecureSkipTLSVerify: true, // self-signed ALB certificate (D10)
  discardResponseBodies: true,
  scenarios: {
    staircase: {
      executor: "ramping-arrival-rate",
      startRate: STEPS[0],
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 600,
      stages,
    },
  },
  thresholds,
  summaryTrendStats: ["avg", "p(50)", "p(95)", "max"],
};

export function setup() {
  const response = http.get(`${BASE_URL}/api/games`, { responseType: "text" });
  if (response.status !== 200) throw new Error(`/api/games returned ${response.status}`);
  const covers = response
    .json()
    .filter((game) => game.cover && game.cover.type === "upload")
    .map((game) => game.cover.url);
  console.log(`${covers.length} uploaded cover(s) in the mix`);
  return { covers, startedAt: Date.now() };
}

// Which hold step we're in, or 0 during a ramp.
function currentStep(startedAt) {
  const elapsed = (Date.now() - startedAt) / 1000;
  const period = RAMP_SEC + HOLD_SEC;
  const index = Math.floor(elapsed / period);
  if (index >= STEPS.length) return 0;
  return elapsed - index * period >= RAMP_SEC ? index + 1 : 0;
}

export default function (data) {
  const step = currentStep(data.startedAt);
  const roll = Math.random();
  let path = "/";
  let name = "page";
  if (roll >= 0.5 && roll < 0.8) {
    path = "/api/games";
    name = "api-games";
  } else if (roll >= 0.8 && data.covers.length > 0) {
    path = data.covers[Math.floor(Math.random() * data.covers.length)];
    name = "cover";
  }
  const response = http.get(`${BASE_URL}${path}`, {
    tags: { step: step ? String(step) : "ramp", name },
    timeout: "30s",
  });
  check(response, { "status 200": (r) => r.status === 200 });
}

export function handleSummary(data) {
  const rows = [
    "step  target/s  achieved/s  p95 ms  p50 ms  errors   per-instance/s  (k6 latency includes the WAN round trip)",
  ];
  STEPS.forEach((rate, i) => {
    const metric = (name) => data.metrics[`${name}{step:${i + 1}}`];
    const count = metric("http_reqs")?.values.count ?? 0;
    if (!count) return;
    const duration = metric("http_req_duration").values;
    const failed = metric("http_req_failed").values.rate;
    const achieved = count / HOLD_SEC;
    rows.push(
      [
        String(i + 1).padEnd(4),
        String(rate).padStart(8),
        achieved.toFixed(1).padStart(11),
        duration["p(95)"].toFixed(0).padStart(7),
        duration["p(50)"].toFixed(0).padStart(7),
        `${(failed * 100).toFixed(2)}%`.padStart(7),
        (achieved / 2).toFixed(1).padStart(16),
      ].join("  "),
    );
  });
  const table = rows.join("\n") + "\n";
  return {
    stdout: `\nPer-step results (hold periods only)\n${table}\n`,
    [`capacity-${new Date().toISOString().replace(/[:.]/g, "-")}.json`]: JSON.stringify(data, null, 2),
  };
}
