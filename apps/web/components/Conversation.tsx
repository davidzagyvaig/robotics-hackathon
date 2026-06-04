"use client";

import { useCallback, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { controller } from "@/lib/controller";

// The ElevenLabs voice agent. The agent has ONE client tool, `render_braille`, which runs
// here in the browser and drives the connected device via the controller. The tool name MUST
// match the tool configured in the ElevenLabs dashboard exactly (see agent/). Must be rendered
// inside a <ConversationProvider> (added in app/page.tsx).

// Client tools execute in the browser; `parameters` is typed `any` by the SDK.
const clientTools = {
  render_braille: async (parameters: { text: string }) =>
    controller.renderBraille(parameters.text),
};

export default function Conversation() {
  const [error, setError] = useState<string | null>(null);

  const conversation = useConversation({
    clientTools,
    onError: (message: string) => setError(message),
  });

  const status = conversation.status; // "disconnected" | "connecting" | "connected" | "error"
  const isSpeaking = conversation.isSpeaking;
  const active = status === "connected" || status === "connecting";

  const start = useCallback(async () => {
    setError(null);
    try {
      // Browser requires an explicit mic-permission gesture before streaming audio.
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await fetch("/api/get-signed-url");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get a signed URL");
      conversation.startSession({ signedUrl: data.signedUrl, clientTools });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the conversation.");
    }
  }, [conversation]);

  return (
    <div className="flex flex-col items-center gap-3">
      {!active ? (
        <button
          onClick={() => void start()}
          className="rounded-full border border-accent/50 bg-panel px-6 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/10"
        >
          🎙️ Start learning to read Braille
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status === "connecting"
                  ? "bg-muted"
                  : isSpeaking
                    ? "bg-accent pulse-flag"
                    : "bg-accent"
              }`}
            />
            {status === "connecting"
              ? "Connecting…"
              : isSpeaking
                ? "BrailleBuddy is speaking…"
                : "Listening — say hello"}
          </div>
          <button
            onClick={() => conversation.endSession()}
            className="text-[11px] text-muted underline-offset-2 hover:text-gray-300 hover:underline"
          >
            end session
          </button>
        </div>
      )}
      {error && <div className="max-w-sm text-center text-[11px] text-flag">{error}</div>}
    </div>
  );
}
