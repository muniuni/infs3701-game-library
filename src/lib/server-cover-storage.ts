import { storageConfig } from "../../scripts/storage-config.mjs";
import { S3CoverStorage } from "./cover-storage";
import { LocalCoverStorage } from "./local-cover-storage";

export function createCoverStorage(mode = storageConfig().mode) {
  return mode === "local"
    ? new LocalCoverStorage(process.env.LOCAL_COVERS_DIR)
    : new S3CoverStorage();
}
