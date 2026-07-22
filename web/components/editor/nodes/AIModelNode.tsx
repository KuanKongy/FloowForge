"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  BotMessageSquare,
  ChevronDown,
  ChevronUp,
  FileAudio,
  Maximize2,
  Minimize2,
  Palette,
  PencilLine,
} from "lucide-react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeHandleWrapper } from "../NodeHandleWrapper";
import { ResumeOverlay } from "../ResumeOverlay";
import { useNodeFrameControls } from "../NodeFrame";
import { runStateClass, useNodeRunState } from "../run-state-context";
import { useTopoStep, useInScope } from "../order-context";
import { apiGet } from "@/lib/api";
import type { Integration } from "@flowforge/shared";

/**
 * Direct port of the original Floowbox `AIModel` component (see
 * /Users/saikou/Documents/Projects/ReactProjects/Floowbox/frontend/app/components/models/AIModel.tsx)
 * with two adjustments to integrate with the FloowForge editor:
 * - The visible "name" is persisted to `data.name` via `useReactFlow().updateNodeData`
 *   instead of local state, so it round-trips across saves.
 * - The component reads inputs from `data` (the saved version) instead of
 *   relying on `useState` initial values, so reopening a flow restores
 *   user-entered fields.
 */

type ModelType = "text" | "image" | "audio" | "file";

const TYPE_META: Record<
  ModelType,
  { label: string; icon: React.ReactNode }
> = {
  text: { label: "Text AI", icon: <BotMessageSquare size={28} strokeWidth={1.5} /> },
  image: { label: "Image AI", icon: <Palette size={28} strokeWidth={1.5} /> },
  audio: { label: "Audio AI", icon: <FileAudio size={28} strokeWidth={1.5} /> },
  file: { label: "File Parser", icon: <BookOpen size={28} strokeWidth={1.5} /> },
};

const MODELS_BY_TYPE: Record<ModelType, string[]> = {
  text: [
    "GPT o3-mini",
    "GPT-4o-mini",
    "Gemini 2.5 Flash",
    "Gemini 2.5 Flash Lite",
    "Llama 3.1 (Cloudflare)",
    "DeepSeek V4 Flash",
  ],
  image: ["GPT Image 1", "DreamShaper", "Flux Schnell"],
  audio: ["TTS-1", "Aura 2 (Cloudflare)"],
  file: ["PDF"],
};

/** UI-label -> model-logo SVG (lives under /public/images, ported from Floowbox). */
const MODEL_ICON: Record<string, string> = {
  "GPT o3-mini": "/images/openai-icon-text.svg",
  "GPT-4o-mini": "/images/openai-icon-text.svg",
  "Llama 3 (Cloudflare)": "/images/ollama-icon.svg",
  "Llama 3.1 (Cloudflare)": "/images/ollama-icon.svg",
  Ollama: "/images/ollama-icon.svg",
  Gemini: "/images/gemini-icon.svg",
  "Gemini 2.5 Flash": "/images/gemini-icon.svg",
  "Gemini 2.5 Flash Lite": "/images/gemini-icon.svg",
  "Gemini 1.5 Flash": "/images/gemini-icon.svg",
  "DeepSeek V4 Flash": "/images/deepseek-icon.svg",
  DeepSeek: "/images/deepseek-icon.svg",
  Deepseek: "/images/deepseek-icon.svg",
  "GPT Image 1": "/images/openai-icon-image.svg",
  "DALLE 3": "/images/openai-icon-image.svg",
  Midjourney: "/images/midjourney-icon.svg",
  DreamShaper: "/images/cloudflare-icon.svg",
  "Flux Schnell": "/images/cloudflare-icon.svg",
  "TTS-1": "/images/openai-icon-audio.svg",
  "Aura 2 (Cloudflare)": "/images/cloudflare-icon.svg",
  PDF: "/images/pdf-icon.svg",
};

const MODEL_PROVIDER: Record<string, Integration["provider"]> = {
  "GPT o3-mini": "openai",
  "GPT-4o-mini": "openai",
  "GPT Image 1": "openai",
  "DALLE 3": "openai",
  "TTS-1": "openai",
  "DeepSeek V4 Flash": "deepseek",
  DeepSeek: "deepseek",
  "Gemini 2.5 Flash": "gemini",
  "Gemini 2.5 Flash Lite": "gemini",
  "Llama 3 (Cloudflare)": "cloudflare",
  "Llama 3.1 (Cloudflare)": "cloudflare",
  DreamShaper: "cloudflare",
  "Flux Schnell": "cloudflare",
  "Aura 2 (Cloudflare)": "cloudflare",
};

export default function AIModelNode({ id, data, isConnectable }: NodeProps) {
  const rf = useReactFlow();
  const state = useNodeRunState(id);
  const step = useTopoStep(id);
  const inScope = useInScope(id);

  const {
    type = "text",
    model,
    context = "",
    temperature = 0.5,
    maxLength = 200,
    prompt = "",
    negativePrompt = "",
    aspect = "auto",
    voice = "alloy",
    speed = 1,
    name,
    integration_id,
  } = (data as {
    type?: ModelType;
    model?: string;
    context?: string;
    temperature?: number;
    maxLength?: number;
    prompt?: string;
    negativePrompt?: string;
    aspect?: string;
    voice?: string;
    speed?: number;
    name?: string;
    integration_id?: string;
  }) || {};

  const meta = TYPE_META[type as ModelType] || TYPE_META.text;
  const models = MODELS_BY_TYPE[type as ModelType] || MODELS_BY_TYPE.text;
  const currentModel = model && models.includes(model) ? model : models[0];
  const frameCtrl = useNodeFrameControls(id, { defaultName: meta.label, data: data as Record<string, unknown>, collapsible: false });

  // Reset stale model values (e.g. user switched type to a list that doesn't
  // include the previously stored model).
  useEffect(() => {
    if (model && !models.includes(model)) {
      rf.updateNodeData(id, { model: models[0] });
    }
  }, [id, model, models, rf]);

  const [isOpen, setIsOpen] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name || "Double Click to Edit");
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  useEffect(() => {
    if (type === "file") return;
    apiGet<Integration[]>("/integrations").then(setIntegrations).catch(() => setIntegrations([]));
  }, [type]);

  useEffect(() => {
    if (!editingName) setDraftName(name || "Double Click to Edit");
  }, [name, editingName]);

  function commitName() {
    setEditingName(false);
    const next = draftName.trim();
    if (next) rf.updateNodeData(id, { name: next });
  }

  function set(k: string, v: unknown) {
    rf.updateNodeData(id, { [k]: v });
  }

  return (
    <div
      className={`relative flex items-center justify-center text-[0.9rem] ${runStateClass(state)} ${
        inScope ? "scope-active" : "scope-dimmed"
      }`}
    >
      <NodeHandleWrapper id={id} type={type} isConnectable={isConnectable} hidden={false}>
        <div className="ai-model__container container-shadow text-black bg-white w-[25em] rounded-[20px] p-[1em] flex flex-col gap-y-[1em]">
          <Header
            type={type as ModelType}
            isOpen={isOpen}
            setIsOpen={setIsOpen}
            meta={meta}
            editingName={editingName}
            setEditingName={setEditingName}
            draftName={draftName}
            setDraftName={setDraftName}
            commitName={commitName}
            displayName={name || "Double Click to Edit"}
            waitChip={frameCtrl.renderWaitChip("inline")}
          />
          {isOpen && (
            <>
              <div className="border-t border-gray-100" />
              <ModelSelection
                model={currentModel}
                setModel={(m) => set("model", m)}
                type={type as ModelType}
                models={models}
              />
              {type !== "file" && (
                <Field label="Credential source">
                  <select
                    value={integration_id || ""}
                    onChange={(e) => set("integration_id", e.target.value || undefined)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="ai-model__input nodrag nopan w-full h-9 text-[0.85rem]"
                  >
                    <option value="">FloowForge credits</option>
                    {integrations
                      .filter((it) => it.provider === MODEL_PROVIDER[currentModel])
                      .map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.label || it.provider} ({it.provider})
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              {type !== "file" && (
                <Field label="Context">
                  <textarea
                    value={context}
                    onChange={(e) => set("context", e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="ai-model__input nodrag nopan nowheel node-scroll leading-tight w-full aspect-[4/1] text-[0.85rem] rounded-[10px] resize-none py-[0.5em] px-[0.8em] placeholder-[#BAB7C3]"
                    placeholder="Context for the AI model that can be referenced in the prompt."
                  />
                </Field>
              )}
              {(type === "text" || type === "image") && (
                <Field label="Prompt">
                  <textarea
                    value={prompt}
                    onChange={(e) => set("prompt", e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="ai-model__input nodrag nopan nowheel node-scroll leading-tight w-full aspect-[4/1] text-[0.85rem] rounded-[10px] resize-none py-[0.5em] px-[0.8em] placeholder-[#BAB7C3]"
                    placeholder="Prompt for the AI."
                  />
                </Field>
              )}
              {type === "image" && (
                <Field label="Negative Prompt">
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => set("negativePrompt", e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="ai-model__input nodrag nopan nowheel node-scroll leading-tight w-full aspect-[4/1] text-[0.85rem] rounded-[10px] resize-none py-[0.5em] px-[0.8em] placeholder-[#BAB7C3]"
                    placeholder="What not to include in the generated image."
                  />
                </Field>
              )}
              {type === "image" && (
                <Field label="Aspect ratio">
                  <select
                    value={aspect}
                    onChange={(e) => set("aspect", e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="ai-model__input nodrag nopan w-full h-9 text-[0.85rem]"
                  >
                    <option value="auto">Auto (fit the prompt)</option>
                    <option value="square">Square — 1:1</option>
                    <option value="landscape">Landscape — 3:2</option>
                    <option value="portrait">Portrait — 2:3</option>
                  </select>
                </Field>
              )}
              {type !== "file" && (
                <Field label="Temperature">
                  <RangeInput
                    value={temperature}
                    onChange={(v) => set("temperature", v)}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </Field>
              )}
              {type === "text" && (
                <Field label="Max length (Tokens)">
                  <NumberInput
                    value={maxLength}
                    onChange={(v) => set("maxLength", v)}
                    max={1000}
                  />
                </Field>
              )}
              {type === "audio" && (
                <>
                  <Field label="Voice">
                    <VoiceSelect voice={voice} setVoice={(v) => set("voice", v)} />
                  </Field>
                  <Field label="Speed">
                    <NumberInput
                      value={speed}
                      onChange={(v) => set("speed", v)}
                      min={0.25}
                      max={4}
                      step={0.05}
                    />
                  </Field>
                </>
              )}
            </>
          )}
        </div>
      </NodeHandleWrapper>
      {step !== undefined && (
        <span className="topo-badge" aria-label={`Step ${step}`}>
          {step}
        </span>
      )}
      <ResumeOverlay nodeId={id} />
    </div>
  );
}

function Header({
  type,
  isOpen,
  setIsOpen,
  meta,
  editingName,
  setEditingName,
  draftName,
  setDraftName,
  commitName,
  displayName,
  waitChip,
}: {
  type: ModelType;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  meta: { label: string; icon: React.ReactNode };
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  draftName: string;
  setDraftName: (v: string) => void;
  commitName: () => void;
  displayName: string;
  waitChip?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-x-[0.9em]">
      <div
        className="rounded-[10px] p-[0.25em]"
        style={{ background: `rgba(var(--${type}__background-rgb), 1)` }}
      >
        <div
          className={`backend-box__${type} rounded-[8px] h-[3em] w-[3em] bg-white flex items-center justify-center`}
          style={{
            boxShadow: `0 1px 2px 0 rgba(var(--${type}__font-rgb), 0.5)`,
            color: `rgba(var(--${type}__font-rgb), 1)`,
          }}
        >
          {meta.icon}
        </div>
      </div>
      <div className="flex flex-col justify-center gap-y-[0.15em]">
        <div className="flex">
          <div
            className="rounded-[10em] font-medium text-[0.7rem] flex items-center justify-center px-[0.7em] py-[0.04em]"
            style={{
              backgroundColor: `rgba(var(--${type}__background-rgb), 1)`,
              color: `rgba(var(--${type}__font-rgb), 1)`,
            }}
          >
            {meta.label}
          </div>
        </div>
        <div className="flex flex-row items-center gap-x-2">
          <div className="font-semibold text-[1rem]">
            {editingName ? (
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                autoFocus
                className="nodrag nopan w-full focus:outline-none border-none bg-transparent"
              />
            ) : (
              <div
                onDoubleClick={() => setEditingName(true)}
                className="cursor-pointer"
                title="Double-click to rename"
              >
                {displayName}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="text-[var(--font--light)] hover:text-[var(--primary)] transition-colors"
            aria-label="Rename"
          >
            <PencilLine size={16} />
          </button>
          {waitChip}
        </div>
      </div>
      <button
        type="button"
        className="absolute top-0 right-0 p-2 cursor-pointer rounded-md hover:bg-[var(--hover-bg)] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Collapse" : "Expand"}
      >
        {isOpen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-y-[0.3em]">
      <div className="ai-model__label--s">{label}</div>
      {children}
    </div>
  );
}

function ModelSelection({
  model,
  setModel,
  type,
  models,
}: {
  model: string;
  setModel: (m: string) => void;
  type: ModelType;
  models: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const icon = MODEL_ICON[model];

  return (
    <Field label={type === "file" ? "File format" : "AI Model"}>
      <div className="relative w-full">
        <div
          onClick={() => setIsOpen(!isOpen)}
          onMouseDown={(e) => e.stopPropagation()}
          className="ai-model__input nodrag nopan w-full aspect-[8/1] font-medium flex justify-between items-center cursor-pointer"
        >
          <div className="flex items-center p-[0.4em]">
            <div
              className="rounded-[7px] mr-3 flex items-center justify-center p-[0.4em]"
              style={{ backgroundColor: `rgba(var(--${type}__background-rgb), 1)` }}
            >
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt={model} width={23} height={23} />
              ) : (
                <span className="w-[23px] h-[23px]" />
              )}
            </div>
            {model}
          </div>
          <span className="mr-[1em]">
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </div>
        {isOpen && (
          <ul className="absolute left-0 w-full mt-1 bg-white border-2 border-gray-200 rounded-lg shadow-lg z-20 nodrag nopan">
            {models.map((option) => (
              <li
                key={option}
                className="p-2 hover:bg-gray-100 cursor-pointer transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setModel(option);
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center">
                  <div
                    className="rounded-[7px] mr-3 flex items-center justify-center w-[38px] h-[38px]"
                    style={{ backgroundColor: `rgba(var(--${type}__background-rgb), 1)` }}
                  >
                    {MODEL_ICON[option] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={MODEL_ICON[option]} alt={option} className="w-[29px] h-[29px]" />
                    ) : null}
                  </div>
                  {option}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

function VoiceSelect({
  voice,
  setVoice,
}: {
  voice: string;
  setVoice: (v: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const voices = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"];
  return (
    <div className="relative w-full">
      <div
        onClick={() => setIsOpen(!isOpen)}
        onMouseDown={(e) => e.stopPropagation()}
        className="ai-model__input nodrag nopan w-full aspect-[8/1] font-medium flex justify-between items-center cursor-pointer"
      >
        <div className="flex items-center py-2 px-3">{voice}</div>
        <span className="mr-[1em]">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </div>
      {isOpen && (
        <ul className="absolute left-0 w-full mt-1 bg-white border-2 border-gray-200 rounded-lg shadow-lg z-20 nodrag nopan">
          {voices.map((v) => (
            <li
              key={v}
              className="py-2 px-3 hover:bg-gray-100 cursor-pointer transition-colors"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                setVoice(v);
                setIsOpen(false);
              }}
            >
              {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      onMouseDown={(e) => e.stopPropagation()}
      className="ai-model__input nodrag nopan h-9 w-full px-3 text-sm rounded-[10px]"
    />
  );
}

function RangeInput({
  value,
  onChange,
  min,
  max,
  step = 0.05,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex-1 nodrag nopan"
      />
      <span className="text-xs text-[var(--muted-foreground)] w-10 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
