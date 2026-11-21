import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import clipsMeta from "../public/clips/clips.json";
import { FPS, LEAD, PORTAL_TINT, SCENE_CLIPS, type Scene } from "./plan";
import { C, fontFamily } from "./theme";

type SceneProps = { scene: Scene & { voice: number; frames: number } };

const meta = clipsMeta as Record<string, { start: number; duration: number }>;

/* ------------------------------------------------------------------ shared pieces */

export const Backdrop: React.FC<{ tone?: "teal" | "night" }> = ({ tone = "teal" }) => {
  const f = useCurrentFrame();
  const drift = (speed: number, amp: number) => Math.sin(f / (FPS * speed)) * amp;
  return (
    <AbsoluteFill
      style={{
        background:
          tone === "teal"
            ? `linear-gradient(135deg, ${C.brand800} 0%, ${C.brand700} 45%, ${C.brand600} 100%)`
            : `radial-gradient(120% 90% at 20% 10%, #12443f 0%, ${C.navy} 55%, #061620 100%)`,
      }}
    >
      <div style={circle(720, -180 + drift(9, 30), -220 + drift(7, 25), 0.07)} />
      <div style={circle(560, 1350 + drift(8, 40), 620 + drift(10, 30), 0.05)} />
      <div style={circle(320, 900 + drift(6, 25), -120 + drift(9, 20), 0.04)} />
      <FlagStripe />
    </AbsoluteFill>
  );
};

const circle = (size: number, left: number, top: number, alpha: number): React.CSSProperties => ({
  position: "absolute",
  width: size,
  height: size,
  left,
  top,
  borderRadius: "50%",
  background: `rgba(255,255,255,${alpha})`,
});

export const FlagStripe: React.FC = () => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, display: "flex" }}>
    <div style={{ flex: 1, background: C.red }} />
    <div style={{ flex: 1, background: C.yellow }} />
    <div style={{ flex: 1, background: C.green }} />
  </div>
);

const useIn = (delay = 0, damping = 18) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, mass: 0.8 } });
};

const Rise: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  children,
  style,
}) => {
  const p = useIn(delay);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 40}px)`, ...style }}>{children}</div>
  );
};

/** Fades the whole scene in and out, so cuts feel soft. */
export const SceneFade: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 12, frames - 12, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

/** Subtitles: the scene text split into sentences, timed by length over the voice. */
export const Subtitles: React.FC<{ text: string; voice: number }> = ({ text, voice }) => {
  const f = useCurrentFrame();
  const t = f / FPS - LEAD;
  const sentences = text.match(/[^.!?…]+[.!?…]+/g)?.map((s) => s.trim()) ?? [text];
  const total = sentences.reduce((n, s) => n + s.length, 0);
  let acc = 0;
  let current = "";
  for (const s of sentences) {
    const start = (acc / total) * voice;
    acc += s.length;
    const end = (acc / total) * voice;
    if (t >= start && t < end + 0.25) current = s;
  }
  if (!current || t < 0 || t > voice + 0.6) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 46,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1340,
          padding: "12px 22px",
          borderRadius: 10,
          background: "rgba(6, 22, 32, 0.78)",
          color: "white",
          fontFamily,
          fontSize: 29,
          lineHeight: 1.35,
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
        }}
      >
        {current}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ title / promise */

export const TitleScene: React.FC<SceneProps> = ({ scene }) => {
  const f = useCurrentFrame();
  const isBrand = scene.id === "promesse";
  const logoP = useIn(4, 14);
  const lineW = interpolate(f, [10, 40], [0, 120], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <Backdrop tone={isBrand ? "teal" : "night"} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily, color: "white", textAlign: "center" }}>
        {isBrand ? (
          <div
            style={{
              background: "white",
              borderRadius: 18,
              padding: "18px 30px",
              marginBottom: 34,
              transform: `scale(${0.6 + 0.4 * logoP})`,
              opacity: logoP,
              boxShadow: "0 30px 60px rgba(0,0,0,.25)",
            }}
          >
            <Img src={staticFile("logo.png")} style={{ height: 120 }} />
          </div>
        ) : null}
        <div style={{ width: lineW, height: 5, background: C.brand300, borderRadius: 3, marginBottom: 30 }} />
        <Rise delay={8}>
          <div style={{ fontSize: isBrand ? 104 : 92, fontWeight: 900, letterSpacing: -2 }}>{scene.title}</div>
        </Rise>
        <Rise delay={22}>
          <div style={{ marginTop: 22, fontSize: 36, fontWeight: 400, color: "rgba(255,255,255,.85)", maxWidth: 1300 }}>
            {scene.subtitle}
          </div>
        </Rise>
      </AbsoluteFill>
      <Subtitles text={scene.text} voice={scene.voice} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ the problem */

export const ProblemScene: React.FC<SceneProps> = ({ scene }) => {
  const f = useCurrentFrame();
  const per = (scene.voice * FPS) / (scene.bullets?.length ?? 1);
  return (
    <AbsoluteFill>
      <Backdrop tone="night" />
      <AbsoluteFill style={{ fontFamily, color: "white", padding: "150px 190px" }}>
        <Rise>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 6, color: C.yellow, textTransform: "uppercase" }}>
            {scene.title}
          </div>
        </Rise>
        <div style={{ marginTop: 60, display: "flex", flexDirection: "column", gap: 44 }}>
          {(scene.bullets ?? []).map((b, i) => {
            const d = Math.round(LEAD * FPS + i * per);
            const p = spring({ frame: f - d, fps: FPS, config: { damping: 16 } });
            const strike = interpolate(f - d, [per * 0.55, per * 0.85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 34, opacity: p, transform: `translateX(${(1 - p) * -60}px)` }}>
                <div
                  style={{
                    width: 66,
                    height: 66,
                    borderRadius: 14,
                    background: "rgba(206,17,38,.18)",
                    border: "2px solid rgba(255,120,120,.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 38,
                    fontWeight: 900,
                    color: "#ff8a8a",
                  }}
                >
                  ✕
                </div>
                <div style={{ position: "relative", fontSize: 54, fontWeight: 700 }}>
                  {b}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "54%",
                      height: 4,
                      width: `${strike * 100}%`,
                      background: "rgba(255,255,255,.55)",
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Subtitles text={scene.text} voice={scene.voice} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ chapter cards */

export const ChapterScene: React.FC<SceneProps> = ({ scene }) => {
  const f = useCurrentFrame();
  const numP = useIn(0, 12);
  const sweep = interpolate(f, [0, 26], [-100, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <Backdrop tone="teal" />
      <AbsoluteFill style={{ fontFamily, color: "white", flexDirection: "row", alignItems: "center", padding: "0 180px", gap: 70 }}>
        <div
          style={{
            fontSize: 420,
            fontWeight: 900,
            lineHeight: 1,
            color: "rgba(255,255,255,.14)",
            transform: `scale(${0.7 + 0.3 * numP})`,
            opacity: numP,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {scene.number}
        </div>
        <div style={{ overflow: "hidden" }}>
          <div style={{ transform: `translateX(${sweep}%)` }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 6, color: C.brand300, textTransform: "uppercase" }}>
              Chapitre {scene.number}
            </div>
            <div style={{ marginTop: 14, fontSize: 108, fontWeight: 900, letterSpacing: -2 }}>{scene.title}</div>
            <Rise delay={16}>
              <div style={{ marginTop: 18, fontSize: 38, color: "rgba(255,255,255,.85)" }}>{scene.subtitle}</div>
            </Rise>
          </div>
        </div>
      </AbsoluteFill>
      <Subtitles text={scene.text} voice={scene.voice} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ app screens */

const FRAME_W = 1440;
const FRAME_H = 900;

const BrowserFrame: React.FC<{ path: string; children: React.ReactNode }> = ({ path, children }) => (
  <div
    style={{
      width: FRAME_W,
      borderRadius: 14,
      overflow: "hidden",
      background: "white",
      boxShadow: "0 40px 90px rgba(0,0,0,.38), 0 0 0 1px rgba(255,255,255,.08)",
    }}
  >
    <div style={{ height: 44, background: "#eef2f4", display: "flex", alignItems: "center", padding: "0 18px", gap: 9 }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
      ))}
      <div
        style={{
          marginLeft: 22,
          flex: 1,
          maxWidth: 620,
          height: 28,
          borderRadius: 8,
          background: "white",
          color: "#64748b",
          fontFamily,
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
        }}
      >
        🔒 edufaso.app{path}
      </div>
    </div>
    <div style={{ width: FRAME_W, height: FRAME_H, position: "relative", overflow: "hidden", background: "#f8fafc" }}>
      {children}
    </div>
  </div>
);

const Clip: React.FC<{ clip: string; frames: number }> = ({ clip, frames }) => {
  const m = meta[clip];
  if (!m) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily, color: "#94a3b8", fontSize: 32 }}>
        Clip « {clip} » à enregistrer
      </AbsoluteFill>
    );
  }
  const available = Math.max(0.5, m.duration - m.start);
  const wanted = frames / FPS;
  // slow the clip down a little rather than freezing it, never below 0.7x
  const rate = Math.max(0.7, Math.min(1, available / wanted));
  return (
    <OffthreadVideo
      src={staticFile(`clips/${clip}.webm`)}
      startFrom={Math.round(m.start * FPS)}
      playbackRate={rate}
      muted
      style={{ width: FRAME_W, height: FRAME_H, objectFit: "cover" }}
    />
  );
};

export const ScreenScene: React.FC<SceneProps> = ({ scene }) => {
  const f = useCurrentFrame();
  const clips = SCENE_CLIPS[scene.id] ?? [];
  const per = Math.floor(scene.frames / Math.max(1, clips.length));
  const idx = Math.min(clips.length - 1, Math.floor(f / per));
  const current = clips[idx];
  const enter = useIn(0, 20);
  const zoom = interpolate(f % per, [0, per], [1.0, 1.045]);
  const tint = PORTAL_TINT[scene.portal ?? ""] ?? C.brand300;
  const labelP = spring({ frame: (f % per) - 6, fps: FPS, config: { damping: 16 } });

  return (
    <AbsoluteFill>
      <Backdrop tone="night" />
      {/* portal badge */}
      <div
        style={{
          position: "absolute",
          top: 34,
          left: 60,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily,
          color: "white",
          opacity: enter,
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: 4, background: tint }} />
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>{scene.portal}</div>
      </div>
      {/* the app, in a browser */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingTop: 52 }}>
        <div
          style={{
            transform: `perspective(2400px) rotateX(${(1 - enter) * 10}deg) translateY(${(1 - enter) * 80}px) scale(0.93)`,
            opacity: enter,
          }}
        >
          <BrowserFrame path={current?.path ?? "/"}>
            {clips.map((c, i) => (
              <Sequence key={c.clip} from={i * per} durationInFrames={i === clips.length - 1 ? scene.frames - i * per : per} layout="none">
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: `scale(${i === idx ? zoom : 1})`,
                    transformOrigin: "50% 30%",
                  }}
                >
                  <Clip clip={c.clip} frames={per} />
                </div>
              </Sequence>
            ))}
          </BrowserFrame>
        </div>
      </AbsoluteFill>
      {/* label of the current screen */}
      {current ? (
        <div
          style={{
            position: "absolute",
            top: 26,
            right: 60,
            fontFamily,
            opacity: labelP,
            transform: `translateY(${(1 - labelP) * -16}px)`,
          }}
        >
          <div
            style={{
              background: "white",
              color: C.brand800,
              fontWeight: 900,
              fontSize: 26,
              padding: "12px 22px",
              borderRadius: 10,
              boxShadow: "0 12px 30px rgba(0,0,0,.25)",
              borderLeft: `6px solid ${tint}`,
            }}
          >
            {current.label}
          </div>
        </div>
      ) : null}
      <Subtitles text={scene.text} voice={scene.voice} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ everything is connected */

const NODES = [
  { label: "Enseignant", sub: "fait l’appel", x: 420, y: 330, tint: "#a78bfa" },
  { label: "Administration", sub: "voit l’absence", x: 1500, y: 330, tint: "#fbbf24" },
  { label: "Élève", sub: "voit sa présence", x: 420, y: 760, tint: "#34d399" },
  { label: "Parent", sub: "est prévenu", x: 1500, y: 760, tint: "#fb7185" },
];

export const SyncScene: React.FC<SceneProps> = ({ scene }) => {
  const f = useCurrentFrame();
  const hub = { x: 960, y: 545 };
  const pulse = (f % 60) / 60;
  return (
    <AbsoluteFill>
      <Backdrop tone="night" />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {NODES.map((n, i) => {
          const d = 20 + i * 14;
          const len = interpolate(f, [d, d + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const x2 = hub.x + (n.x - hub.x) * len;
          const y2 = hub.y + (n.y - hub.y) * len;
          // a dot travelling from the teacher to everyone else, again and again
          const travel = ((f - 70 - i * 6) % 75) / 75;
          const showDot = f > 70 && i > 0;
          const from = i === 0 ? hub : hub;
          const dx = from.x + (n.x - from.x) * travel;
          const dy = from.y + (n.y - from.y) * travel;
          return (
            <g key={n.label}>
              <line x1={hub.x} y1={hub.y} x2={x2} y2={y2} stroke="rgba(94,234,212,.45)" strokeWidth={4} strokeDasharray="10 10" />
              {showDot ? <circle cx={dx} cy={dy} r={10} fill={C.brand300} opacity={1 - travel * 0.4} /> : null}
            </g>
          );
        })}
        {f > 60 ? (
          (() => {
            const t = ((f - 60) % 75) / 75;
            const n = NODES[0];
            return <circle cx={n.x + (hub.x - n.x) * t} cy={n.y + (hub.y - n.y) * t} r={10} fill={C.yellow} />;
          })()
        ) : null}
        <circle cx={hub.x} cy={hub.y} r={120 + pulse * 40} fill="none" stroke="rgba(94,234,212,.25)" strokeWidth={3} opacity={1 - pulse} />
      </svg>
      {/* hub */}
      <div
        style={{
          position: "absolute",
          left: hub.x - 120,
          top: hub.y - 120,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 30px 70px rgba(0,0,0,.35)",
        }}
      >
        <Img src={staticFile("logo.png")} style={{ height: 140 }} />
      </div>
      {NODES.map((n, i) => {
        const p = spring({ frame: f - 10 - i * 12, fps: FPS, config: { damping: 14 } });
        return (
          <div
            key={n.label}
            style={{
              position: "absolute",
              left: n.x - 190,
              top: n.y - 70,
              width: 380,
              padding: "22px 26px",
              borderRadius: 16,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.18)",
              fontFamily,
              color: "white",
              transform: `scale(${0.6 + 0.4 * p})`,
              opacity: p,
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 5, background: n.tint }} />
            <div>
              <div style={{ fontSize: 38, fontWeight: 900 }}>{n.label}</div>
              <div style={{ fontSize: 26, color: "rgba(255,255,255,.75)" }}>{n.sub}</div>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 80, width: "100%", textAlign: "center", fontFamily, color: "white" }}>
        <Rise>
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -1 }}>{scene.title}</div>
        </Rise>
      </div>
      <Subtitles text={scene.text} voice={scene.voice} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ outro */

export const OutroScene: React.FC<SceneProps> = ({ scene }) => {
  const f = useCurrentFrame();
  const logoP = useIn(0, 14);
  const accent = interpolate(f, [30, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Backdrop tone="teal" />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily, color: "white", textAlign: "center" }}>
        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: "16px 28px",
            marginBottom: 46,
            transform: `scale(${0.6 + 0.4 * logoP})`,
            opacity: logoP,
          }}
        >
          <Img src={staticFile("logo.png")} style={{ height: 110 }} />
        </div>
        <Rise delay={12}>
          <div style={{ fontSize: 86, fontWeight: 900, letterSpacing: -2 }}>{scene.title}</div>
        </Rise>
        <div style={{ marginTop: 10, fontSize: 86, fontWeight: 900, color: C.brand300, opacity: accent, transform: `translateY(${(1 - accent) * 30}px)` }}>
          {scene.subtitle}
        </div>
        <Rise delay={70}>
          <div style={{ marginTop: 50, fontSize: 28, color: "rgba(255,255,255,.75)" }}>EduFaso · Système de gestion scolaire</div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
