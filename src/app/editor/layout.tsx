import "@/app/editor/velxio-styles/App.css";
import "@/app/editor/velxio-styles/index.css";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="editor-root fixed inset-0 z-50 flex flex-col bg-[#1e1e1e]">
      {children}
    </div>
  );
}
