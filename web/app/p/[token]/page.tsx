"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/BrandWordmark";


function movePagePaletteItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removePagePaletteItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

type IoPort = { name: string; type?: string };

function buildPageProviderSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterPageProviderRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildPageProviderSearchText(record).includes(needle));
}

type FlowInfo = {
  flow_id: string;
  flow_name: string | null;
  inputs: IoPort[];
  outputs: IoPort[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

/**
 * Public, no-login form page that lets non-technical users trigger a flow.
 *
 * The owner of a flow shares ``/p/<webhook_token>`` (the same token the
 * Webhook In node generates). This page:
 *
 *  1. Fetches ``GET /t/webhook/{token}/info`` to discover the flow's name +
 *     declared input ports.
 *  2. Renders a form with one field per input.
 *  3. Submits as JSON to ``POST /t/webhook/{token}`` (the existing public
 *     trigger endpoint), which enqueues a real run.
 *
 * The page intentionally does NOT show run details, since the visitor is
 * untrusted. We just confirm submission and tell them their request is being
 * processed.
 */
export default function PublicFormPage() {
  const params = useParams<{ token: string }>();
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
        for (const p of data.inputs) initial[p.name] = "";
        setValues(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load form"))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const body =
        info && info.inputs.length > 0
          ? values
          : { value: values.__free__ || "" };
      const res = await fetch(`${API}/t/webhook/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <header className="mb-6 flex items-center gap-2">
          <BrandWordmark />
          <span className="text-[var(--muted-foreground)]">/ public form</span>
        </header>

        <div className="card-surface p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 size={16} className="animate-spin" /> Loading form…
            </div>
          ) : error && !info ? (
            <div className="text-sm text-red-500">{error}</div>
          ) : submitted ? (
            <div>
              <h1 className="text-xl font-semibold">Submitted</h1>
              <p className="text-sm text-[var(--muted-foreground)] mt-2">
                Your request was sent. The flow owner will see the result on
                their side.
              </p>
              <Button
                className="mt-5"
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                  setError(null);
                }}
              >
                Submit another
              </Button>
            </div>
          ) : info ? (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-xl font-semibold">{info.flow_name || "Untitled flow"}</h1>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                  Fill out the form and submit to run this flow.
                </p>
              </div>
              {info.inputs.length === 0 ? (
                <Field
                  label="Input"
                  hint="This flow doesn't declare named inputs; whatever you type is sent as the body."
                >
                  <textarea
                    value={values.__free__ || ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, __free__: e.target.value }))
                    }
                    className="h-28 w-full p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm resize-none"
                  />
                </Field>
              ) : (
                info.inputs.map((p) => (
                  <Field key={p.name} label={p.name}>
                    <textarea
                      value={values[p.name] || ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [p.name]: e.target.value }))
                      }
                      className="h-20 w-full p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-sm resize-none"
                    />
                  </Field>
                ))
              )}
              {error && <div className="text-sm text-red-500">{error}</div>}
              <div className="flex justify-end">
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>}
      {children}
    </label>
  );
}
