// Dev-only helper: restores a runnable test snapshot + index.html into dist
// after a build (which wipes dist). Not part of the shipped pipeline.
import { renderStub } from "@/lib/projects/sharePlayerStub";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const snap = JSON.parse(readFileSync(join(dir, "_test-snapshot.json"), "utf8"));
writeFileSync(join(dir, "dist/snapshot.json"), JSON.stringify(snap));
const html = renderStub({
  title: snap.name ?? "Test",
  assetBase: "",
  snapshot: snap,
});
writeFileSync(join(dir, "dist/index.html"), html);
console.log("wrote dist/snapshot.json + dist/index.html");
