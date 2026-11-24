"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuctionSnapshot } from "@/auction/types";

export type Connection = "connecting" | "live" | "reconnecting";

const HEARTBEAT_MS = 15_000;
const STALE_MS = 45_000;

/**
 * Live auction state. The server pushes a full snapshot on connect and after
 * every change; snapshots carry a version so an older one never replaces a newer
 * one. Reconnects automatically (backoff with jitter), immediately when the
 * network or the tab comes back, and treats a silent socket as dead.
 */
export function useAuctionLive(initial: AuctionSnapshot | null) {
  const [snapshot, setSnapshot] = useState<AuctionSnapshot | null>(initial);
  const [connection, setConnection] = useState<Connection>("connecting");
  const versionRef = useRef(initial?.version ?? -1);

  const apply = useCallback((next: AuctionSnapshot) => {
    if (next.version < versionRef.current) return;
    versionRef.current = next.version;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastMessage = Date.now();
    let stopped = false;

    const connect = () => {
      clearTimeout(retryTimer);
      const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/auction/live`);
      ws = socket;
      socket.onopen = () => {
        retry = 0;
        lastMessage = Date.now();
        setConnection("live");
      };
      socket.onmessage = (e) => {
        lastMessage = Date.now();
        if (e.data === "pong") return;
        try {
          const msg = JSON.parse(String(e.data)) as { type: string; snapshot?: AuctionSnapshot };
          if (msg.type === "state" && msg.snapshot) apply(msg.snapshot);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        if (stopped || ws !== socket) return;
        setConnection("reconnecting");
        const delay = Math.min(8000, 500 * 2 ** retry) * (0.7 + Math.random() * 0.6);
        retry++;
        retryTimer = setTimeout(connect, delay);
      };
      socket.onerror = () => socket.close();
    };

    const wake = () => {
      if (document.visibilityState === "hidden") return;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        retry = 0;
        connect();
      }
    };

    const heartbeat = setInterval(() => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessage > STALE_MS) ws.close();
      else ws.send("ping");
    }, HEARTBEAT_MS);

    connect();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      ws?.close();
    };
  }, [apply]);

  return { snapshot, connection, apply };
}
