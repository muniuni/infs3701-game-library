// Shallow ALB health check: proves this process serves requests. It never
// touches the database, so an RDS failover can't mark every target unhealthy
// at once (docs/GROUP_ARCHITECTURE.md, D5).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
