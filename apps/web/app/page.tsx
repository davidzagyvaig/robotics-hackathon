"use client";

import { ConversationProvider } from "@elevenlabs/react";
import ConnectDevice from "@/components/ConnectDevice";
import Conversation from "@/components/Conversation";
import BrailleCell from "@/components/BrailleCell";
import { useBrailleState } from "@/lib/controller";

export default function Page() {
  const { connected } = useBrailleState();

  return (
    <ConversationProvider>
      <main className="flex min-h-screen flex-col bg-ink text-gray-200">
      <header className="flex items-center justify-between border-b border-line bg-panel px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-2 gap-0.5">
            {[1, 1, 1, 0, 1, 1].map((on, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${on ? "bg-accent" : "bg-line"}`}
              />
            ))}
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">BrailleBuddy</h1>
            <p className="text-[10px] text-muted">voice-guided braille teaching box</p>
          </div>
        </div>
        <a
          href="https://github.com/davidzagyvaig/robotics-hackathon"
          className="text-[11px] text-muted hover:text-gray-300"
          target="_blank"
          rel="noreferrer"
        >
          docs ↗
        </a>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-xl flex-col items-center gap-10">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-100">
              {connected ? "Start learning to read Braille" : "Plug in your BrailleBuddy"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {connected
                ? "Ask your tutor to teach you a letter or word — feel each dot rise."
                : "Connect over USB or Bluetooth to begin. You'll talk to a voice tutor and feel the dots move."}
            </p>
          </div>

          <BrailleCell />
          <ConnectDevice />
          {connected && <Conversation />}
        </div>
      </div>

      <footer className="border-t border-line px-6 py-2 text-center text-[10px] text-muted">
        Chrome/Edge · USB + Bluetooth · ElevenLabs · ESP32-S3 — built at the Hungarian Robotics Hackathon
      </footer>
      </main>
    </ConversationProvider>
  );
}
