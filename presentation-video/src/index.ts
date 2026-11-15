import { Composition, registerRoot } from "remotion";
import React from "react";
import { FPS, TOTAL_FRAMES } from "./plan";
import { EduFasoVideo } from "./Video";

const Root: React.FC = () =>
  React.createElement(Composition, {
    id: "EduFaso",
    component: EduFasoVideo,
    durationInFrames: TOTAL_FRAMES,
    fps: FPS,
    width: 1920,
    height: 1080,
  });

registerRoot(Root);
