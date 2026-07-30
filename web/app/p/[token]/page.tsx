"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/BrandWordmark";

type FormField = {
  node_id?: string;
  name: string;
  type?: string;
  default_value?: string;
};

type FlowInfo = {
  flow_id: string;
  flow_name: string | null;
  header_text: string | null;
  show_outputs: boolean;
  inputs: FormField[];
  outputs: unknown[];
};

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001").replace(/\/+$/, "");

/** Address a field by node id, falling back to its label for legacy payloads. */
function fieldKey(field: FormField): string {
  return field.node_id || field.name;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export default function PublicFormPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [info, setInfo] = useState<FlowInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setError(null);
    fetch(`${API}/t/webhook/${token}/info`)
      .then((r) => {
        if (!r.ok)
          throw new Error(
            r.status === 404
              ? "This link is not active. Ask the owner to re-share."
              : `${r.status} ${r.statusText}`
          );
        return r.json();
      })
      .then((data: FlowInfo) => {
        setInfo(data);
        const initial: Record<string, string> = {};
        // Keyed by node_id so each field reaches its own node. Keying by the
        // display name meant two fields with the same label collided, and the
        // engine had no way to tell which node a value belonged to.
        for (const p of data.inputs) initial[fieldKey(p)] = p.default_value || "";
        setValues(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load form"))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // Dynamic fields only (defaults-only forms send `{}` so the engine uses node snapshots).
      const body =
        info && info.inputs.length > 0 ? values : {};
      const res = await fetch(`${API}/t/webhook/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const { run_id, show_outputs } = await res.json();
      if (show_outputs) {
        router.push(`/p/${token}/result/${run_id}`);
      } else {
        setSubmitted(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const pageTitle = info?.header_text || info?.flow_name || "Submit";

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <header className="mb-6 flex items-center gap-2">
          <BrandWordmark />
          <span className="text-[var(--muted-foreground)]">/ form</span>
        </header>

        <div className="card-surface p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 size={16} className="animate-spin" /> Loading form…
            </div>
          ) : error && !info ? (
            <div className="text-sm text-red-500">{error}</div>
          ) : submitted ? (
            <div className="flex flex-col gap-4 items-center py-6">
              <CheckCircle2 size={40} className="text-green-600" />
              <h2 className="text-lg font-semibold">Submitted successfully</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Your response has been recorded.
              </p>
              <Button variant="outline" onClick={() => { setSubmitted(false); setError(null); }}>
                Submit another
              </Button>
            </div>
          ) : info ? (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-xl font-semibold">{pageTitle}</h1>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                  {info.inputs.length === 0
                    ? "Submit to run this workflow using the saved defaults from your canvas."
                    : "Fill out the form below and submit."}
                </p>
              </div>
              {info.inputs.length > 0 &&
                info.inputs.map((p) => (
                  <FormField key={fieldKey(p)} label={p.name} type={p.type || "textbox"}>
                    {renderInput(
                      p,
                      values[fieldKey(p)] ?? "",
                      (v) => setValues((prev) => ({ ...prev, [fieldKey(p)]: v })),
                      (msg) => setError(msg)
                    )}
                  </FormField>
                ))}
              {error && <div className="text-sm text-red-500">{error}</div>}
              <div className="flex justify-end">
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderInput(
  field: FormField,
  value: string,
  onChange: (v: string) => void,
  onError: (message: string) => void,
) {
  const cls = "w-full p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm";

  /** Read a picked file as a data URL, rejecting anything over the cap. */
  const readFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      onError(`${file.name} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => onError(`Could not read ${file.name}.`);
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  switch (field.type) {
    case "imagebox":
      return <input type="file" accept="image/*" className={cls} onChange={readFile} />;
    case "audiobox":
      return <input type="file" accept="audio/*" className={cls} onChange={readFile} />;
    case "filebox":
      return <input type="file" className={cls} onChange={readFile} />;
    default:
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-20 ${cls} resize-none`}
          placeholder={`Enter ${field.name}…`}
        />
      );
  }
}

function FormField({
  label,
  type,
  children,
}: {
  label: string;
  type: string;
  children: React.ReactNode;
}) {
  const typeLabel: Record<string, string> = {
    textbox: "Text",
    imagebox: "Image",
    audiobox: "Audio",
    filebox: "File",
    chatbox: "Text",
  };
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium capitalize">{label}</span>
        <span className="text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)] rounded px-1.5 py-0.5">
          {typeLabel[type] || "Text"}
        </span>
      </div>
      {children}
    </label>
  );
}
