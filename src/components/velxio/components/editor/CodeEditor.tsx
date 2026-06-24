// @ts-nocheck
import Editor from "@monaco-editor/react";
import { useEditorStore } from "@/services/velxio/store/useEditorStore";
import {
  registerRetroAsm,
  LANGUAGE_ID as RETRO_ASM_ID,
} from "@/components/velxio/components/editor/retroAsmLanguage";

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "s" || ext === "asm") return RETRO_ASM_ID;
  if (["ino", "cpp", "c", "cc", "h", "hpp"].includes(ext)) return "cpp";
  if (ext === "py") return "python";
  if (ext === "json") return "json";
  if (ext === "md") return "markdown";
  if (ext === "hex") return "plaintext";
  return "plaintext";
}

export const CodeEditor = ({ readOnly = false }: { readOnly?: boolean }) => {
  const { files, activeFileId, setFileContent, theme, fontSize } =
    useEditorStore();
  const activeFile = files.find((f) => f.id === activeFileId);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <Editor
        // key forces a fresh editor instance per file (preserves undo/redo per file)
        key={activeFileId}
        height="100%"
        language={activeFile ? getLanguage(activeFile.name) : "cpp"}
        theme={theme}
        value={activeFile?.content ?? ""}
        beforeMount={(monaco) => {
          (window as any).MonacoEnvironment = {
            getWorker() {
              return new Worker(
                URL.createObjectURL(
                  new Blob(["self.onmessage = function(){}"], {
                    type: "text/javascript",
                  }),
                ),
              );
            },
          };
          registerRetroAsm(monaco);
        }}
        onChange={(value) => {
          if (readOnly) return;
          if (activeFileId) setFileContent(activeFileId, value || "");
        }}
        options={{
          readOnly,
          domReadOnly: readOnly,
          minimap: { enabled: true },
          fontSize,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
        }}
      />
    </div>
  );
};
