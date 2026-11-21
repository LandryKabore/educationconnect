import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from "remotion";
import { FPS, LEAD, SCENES, TOTAL_FRAMES } from "./plan";
import { ChapterScene, OutroScene, ProblemScene, SceneFade, ScreenScene, SyncScene, TitleScene } from "./Scenes";

const BY_KIND = {
  title: TitleScene,
  problem: ProblemScene,
  chapter: ChapterScene,
  screen: ScreenScene,
  sync: SyncScene,
  outro: OutroScene,
} as const;

export const EduFasoVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: "#061620" }}>
      {/* calm music under the voice, fading out at the end */}
      <Audio
        src={staticFile("music.wav")}
        volume={(f) =>
          interpolate(f, [0, FPS * 3, TOTAL_FRAMES - FPS * 6, TOTAL_FRAMES], [0, 0.22, 0.22, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      {SCENES.map((scene) => {
        const Comp = BY_KIND[scene.kind];
        const start = from;
        from += scene.frames;
        return (
          <Sequence key={scene.id} from={start} durationInFrames={scene.frames} name={scene.id}>
            <SceneFade frames={scene.frames}>
              <Comp scene={scene} />
            </SceneFade>
            <Sequence from={Math.round(LEAD * FPS)} layout="none">
              <Audio src={staticFile(`voice/${scene.id}.wav`)} volume={1} />
            </Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
