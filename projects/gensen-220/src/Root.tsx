import React from 'react';
import { Composition } from 'remotion';
import { Opening } from './Opening';
import { FPS, openingShots } from './timeline';
export const Root: React.FC = () => (
  <Composition id="Opening" component={Opening} width={1920} height={1080} fps={FPS} durationInFrames={openingShots().total} />
);
