// @ts-nocheck
import { triggerDownloadVlx } from "@/lib/velxio/utils/vlxFile";
import { useProjectStore } from "@/services/velxio/store/useProjectStore";

export function triggerSaveAction(): void {
  const proj = useProjectStore.getState().currentProject;
  const name = proj?.slug ?? proj?.id ?? undefined;
  const filename = triggerDownloadVlx({ name });
  console.info(`[oss] downloaded workspace as ${filename}`);
}
