import EditorClient from "@/components/editor/EditorClient";

export default async function FlowEditorPage({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  return <EditorClient flowId={flowId} />;
}
