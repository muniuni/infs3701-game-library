import { connection } from "next/server";

// Shows which instance and Availability Zone rendered the page, from the env
// file written at boot (docs/GROUP_ARCHITECTURE.md, D13). Hidden when unset.
export async function ServedBy() {
  // Render per request, so each instance reports itself rather than the build.
  await connection();
  const instance = process.env.INSTANCE_ID?.trim();
  if (!instance) return null;
  const zone = process.env.AVAILABILITY_ZONE?.trim();
  return (
    <footer className="served-by" aria-label="Server">
      Served by {instance}
      {zone ? ` · ${zone}` : ""}
    </footer>
  );
}
