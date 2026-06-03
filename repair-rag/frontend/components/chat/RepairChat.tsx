"use client";

/**
 * components/chat/RepairChat.tsx
 * ──────────────────────────────
 * Production-grade chat interface for the Electronic Repair RAG system.
 *
 * Features:
 * - Text + image (drag & drop / paste) input
 * - Optimistic UI with pending state
 * - Markdown-rendered assistant responses
 * - Source citation accordion
 * - Session persistence across page reloads
 * - Accessible keyboard navigation
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  Send,
  Wrench,
  X,
  AlertTriangle,
  Bot,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { repairApi } from "@/lib/api";
import type { GuideChunk, Message } from "@/types/repair";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RepairChatProps {
  initialSessionId?: string;
  deviceType?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceCitations({ guides }: { guides: GuideChunk[] }) {
  const [open, setOpen] = useState(false);
  if (!guides.length) return null;

  return (
    <div className="mt-3 border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Wrench className="h-3 w-3" />
          {guides.length} source{guides.length !== 1 ? "s" : ""} used
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="divide-y divide-border/50">
              {guides.map((guide) => (
                <div key={guide.id} className="px-3 py-2.5 bg-muted/20">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-xs font-medium text-foreground">{guide.title}</p>
                      {(guide.manufacturer || guide.model) && (
                        <p className="text-xs text-muted-foreground">
                          {[guide.manufacturer, guide.model].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {(guide.similarity_score * 100).toFixed(0)}% match
                      </Badge>
                      {guide.source_url && (
                        <a
                          href={guide.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {guide.chunk_text}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Renders step-by-step formatted text from the LLM
function FormattedAnswer({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        // Numbered step lines: "1. Do something"
        const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (stepMatch) {
          return (
            <div key={i} className="flex gap-2.5">
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-semibold mt-0.5">
                {stepMatch[1]}
              </span>
              <span className="text-foreground">{stepMatch[2]}</span>
            </div>
          );
        }

        // Warning lines containing safety keywords
        const isWarning = /⚠|warning|caution|danger|esd|voltage|sharp/i.test(line);
        if (isWarning && line.trim()) {
          return (
            <div key={i} className="flex gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-xs">{line.replace(/^[⚠️\s*-]+/, "").trim()}</span>
            </div>
          );
        }

        // Bold headers: "**Title**"
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-semibold text-foreground mt-2">{line.replace(/\*\*/g, "")}</p>;
        }

        // Empty lines → spacing
        if (!line.trim()) return <div key={i} className="h-1" />;

        return <p key={i} className="text-foreground/90">{line}</p>;
      })}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 flex items-center justify-center w-8 h-8 rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted border border-border text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[78%] space-y-2", isUser && "items-end flex flex-col")}>
        {/* Uploaded image preview */}
        {msg.image_url && (
          <div className="rounded-xl overflow-hidden border border-border shadow-sm max-w-xs">
            <img
              src={msg.image_url}
              alt="Uploaded repair image"
              className="w-full object-cover"
            />
          </div>
        )}

        {/* Message content */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border rounded-tl-sm shadow-sm"
          )}
        >
          {msg.pending ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Analysing…</span>
            </div>
          ) : isUser ? (
            <p className="text-sm leading-relaxed">{msg.message}</p>
          ) : (
            <FormattedAnswer text={msg.message} />
          )}
        </div>

        {/* Source citations (assistant only) */}
        {!isUser && !msg.pending && msg.retrieved_guides && (
          <div className="w-full">
            <SourceCitations guides={msg.retrieved_guides} />
          </div>
        )}

        {/* Model badge */}
        {!isUser && msg.model_used && !msg.pending && (
          <p className="text-[10px] text-muted-foreground px-1">
            via {msg.model_used.split("/").pop()}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RepairChat({ initialSessionId, deviceType }: RepairChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle paste image
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) attachImage(file);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const attachImage = useCallback((file: File) => {
    setPendingImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) attachImage(file);
    },
    [attachImage]
  );

  const removeImage = () => {
    setPendingImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    const query = input.trim();
    if (!query && !pendingImage) return;
    if (isLoading) return;

    setError(null);
    const userMsgId = crypto.randomUUID();
    const pendingMsgId = crypto.randomUUID();

    // Optimistic user message
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      message: query || "(image attached)",
      image_url: imagePreview,
      created_at: new Date().toISOString(),
    };

    // Optimistic pending assistant message
    const pendingMsg: Message = {
      id: pendingMsgId,
      role: "assistant",
      message: "",
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput("");
    removeImage();
    setIsLoading(true);

    try {
      const result = await repairApi.query({
        text_query: query || "Please analyse this repair image.",
        image: pendingImage,
        session_id: sessionId,
        device_type: deviceType,
      });

      // Persist session ID for follow-up questions
      if (!sessionId) setSessionId(result.session_id);

      // Replace pending bubble with real response
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsgId
            ? {
                id: result.message_id,
                role: "assistant",
                message: result.answer,
                retrieved_guides: result.retrieved_guides,
                model_used: result.model_used,
                image_url: null,
                created_at: new Date().toISOString(),
                pending: false,
              }
            : m
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      // Remove pending bubble on error
      setMessages((prev) => prev.filter((m) => m.id !== pendingMsgId));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <TooltipProvider>
      <Card
        className={cn(
          "flex flex-col h-[700px] w-full max-w-3xl mx-auto shadow-lg transition-all",
          isDragging && "ring-2 ring-primary ring-offset-2"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {/* Header */}
        <CardHeader className="pb-3 border-b">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">
              <Wrench className="h-4 w-4 text-primary" />
            </div>
            Repair Assistant
            {sessionId && (
              <Badge variant="outline" className="text-xs font-normal ml-auto">
                Session active
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        {/* Message list */}
        <ScrollArea className="flex-1 px-4">
          <div className="py-4 space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Wrench className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Ask about any repair</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Describe the issue or upload a photo. I'll find the relevant guide.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "iPhone screen replacement",
                    "Laptop battery replacement",
                    "PlayStation controller drift",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted hover:text-foreground text-muted-foreground transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
                <button onClick={() => setError(null)} className="ml-auto hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <Separator />

        {/* Input area */}
        <CardContent className="pt-3 pb-4 space-y-2.5">
          {/* Image preview strip */}
          <AnimatePresence>
            {imagePreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="relative inline-flex"
              >
                <img
                  src={imagePreview}
                  alt="Attached image preview"
                  className="h-20 w-auto rounded-lg border border-border object-cover shadow-sm"
                />
                <button
                  onClick={removeImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text + action row */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the repair issue… or paste / drop an image"
                rows={2}
                className="resize-none pr-3 text-sm leading-relaxed"
                disabled={isLoading}
              />
            </div>

            {/* Image attach */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach image (or paste)</TooltipContent>
            </Tooltip>

            {/* Send */}
            <Button
              size="icon"
              className="shrink-0"
              onClick={handleSubmit}
              disabled={isLoading || (!input.trim() && !pendingImage)}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Shift+Enter for new line · Paste image from clipboard · Drag & drop supported
          </p>
        </CardContent>
      </Card>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) attachImage(file);
        }}
      />
    </TooltipProvider>
  );
}
