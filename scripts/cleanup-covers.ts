import "dotenv/config";
import { getRepository } from "../src/lib/server-repository";
async function main() {
  const repository = getRepository();
  try {
    console.log(
      `Processed ${await repository.cleanup()} queued cover deletions.`,
    );
  } finally {
    await repository.db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
