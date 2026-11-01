/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

import { Skeleton, Window } from '../Illustrations';

import styles from './anatomy.module.css';

const BORDER = 'var(--home-hero-devices-border)';
const BACKGROUND = 'var(--home-hero-devices-background)';
const TEXT = 'var(--ifm-font-color-base)';
const MUTED = 'var(--home-secondary-text)';
const ACCENT = 'var(--ifm-color-primary)';
const GREEN = 'var(--home-code-green)';
const MONO = 'var(--ifm-font-family-monospace)';

/** The window sits to the right of the pipeline column. */
const WX = 260;
const LABEL_X = 714;

const COLUMN_X = 8;
const COLUMN_W = 204;
const COLUMN_MID = COLUMN_X + COLUMN_W / 2;

const CODE_Y = 8;
const CODE_H = 172;
const LINE_Y = CODE_Y + 56;
const LINE_STEP = 19;

/** Seconds into the 6 s loop. */
const AT = {
  code: 0,
  engine: 1.0,
  fabric: 1.8,
  gpui: 2.6,
  paint: 3.5,
  step: 0.3,
};

type Part = {
  label: string;
  /** Index of the JSX line that declares it. */
  line: number;
  /** Highlight box in window coordinates. */
  box: [number, number, number, number];
  /** Where the callout starts, and its height. */
  from: [number, number];
};

const PARTS: Part[] = [
  { label: 'Image', line: 1, box: [146, 48, 270, 86], from: [392, 91] },
  { label: 'Text', line: 2, box: [140, 144, 150, 28], from: [292, 158] },
  {
    label: 'ScrollView',
    line: 3,
    box: [146, 178, 270, 70],
    from: [404, 213],
  },
  { label: 'TextInput', line: 4, box: [146, 266, 270, 38], from: [404, 285] },
  { label: 'View', line: 0, box: [20, 48, 110, 268], from: [75, 257] },
];

function delay(seconds: number, extra?: Record<string, string>) {
  return { '--delay': `${seconds}s`, ...extra } as React.CSSProperties;
}

function partAt(part: Part) {
  return AT.paint + PARTS.indexOf(part) * AT.step;
}

const CODE: [string, string][][] = [
  [
    ['<', TEXT],
    ['View', GREEN],
    ['>', TEXT],
  ],
  [
    ['  <', TEXT],
    ['Image', GREEN],
    [' />', TEXT],
  ],
  [
    ['  <', TEXT],
    ['Text', GREEN],
    ['>Meeting notes</', TEXT],
    ['Text', GREEN],
    ['>', TEXT],
  ],
  [
    ['  <', TEXT],
    ['ScrollView', GREEN],
    [' />', TEXT],
  ],
  [
    ['  <', TEXT],
    ['TextInput', GREEN],
    [' />', TEXT],
  ],
  [
    ['</', TEXT],
    ['View', GREEN],
    ['>', TEXT],
  ],
];

function CodeCard() {
  return (
    <g>
      <rect
        x={COLUMN_X}
        y={CODE_Y}
        width={COLUMN_W}
        height={CODE_H}
        rx={10}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={1.5}
      />
      <rect
        className={styles.glow}
        style={delay(AT.code)}
        x={COLUMN_X}
        y={CODE_Y}
        width={COLUMN_W}
        height={CODE_H}
        rx={10}
        stroke={ACCENT}
        strokeWidth={2}
      />
      <text x={COLUMN_X + 14} y={CODE_Y + 22} fontSize={11} fill={MUTED}>
        App.tsx
      </text>
      <path
        d={`M${COLUMN_X + 0.75} ${CODE_Y + 34}H${COLUMN_X + COLUMN_W - 0.75}`}
        stroke={BORDER}
        strokeWidth={1}
      />
      {PARTS.map(part => (
        <rect
          key={part.label}
          className={styles.flash}
          style={delay(partAt(part))}
          x={COLUMN_X + 6}
          y={LINE_Y + part.line * LINE_STEP - 13}
          width={COLUMN_W - 12}
          height={18}
          rx={4}
          fill={ACCENT}
          fillOpacity={0.18}
        />
      ))}
      {CODE.map((segments, i) => (
        <text
          key={i}
          x={COLUMN_X + 14}
          y={LINE_Y + i * LINE_STEP}
          fontSize={10}
          fontFamily={MONO}
          className={styles.code}
        >
          {segments.map(([text, color], j) => (
            <tspan key={j} fill={color}>
              {text}
            </tspan>
          ))}
        </text>
      ))}
    </g>
  );
}

function Stage({
  y,
  title,
  detail,
  at,
}: {
  y: number;
  title: string;
  detail: string;
  at: number;
}) {
  return (
    <g>
      <rect
        x={COLUMN_X}
        y={y}
        width={COLUMN_W}
        height={32}
        rx={8}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={1.5}
      />
      <rect
        className={styles.glow}
        style={delay(at)}
        x={COLUMN_X}
        y={y}
        width={COLUMN_W}
        height={32}
        rx={8}
        stroke={ACCENT}
        strokeWidth={2}
      />
      <text
        x={COLUMN_X + 14}
        y={y + 20.5}
        fontSize={12}
        fontWeight={600}
        fill={TEXT}
      >
        {title}
      </text>
      <text
        x={COLUMN_X + COLUMN_W - 14}
        y={y + 20.5}
        textAnchor="end"
        fontSize={10}
        fontFamily={MONO}
        fill={MUTED}
      >
        {detail}
      </text>
    </g>
  );
}

function Arrow({
  from,
  to,
  at,
}: {
  from: [number, number];
  to: [number, number];
  at: number;
}) {
  const vertical = from[0] === to[0];
  const head = vertical
    ? `M${to[0] - 4} ${to[1] - 5}l4 5l4 -5`
    : `M${to[0] - 5} ${to[1] - 4}l5 4l-5 4`;
  const distance = vertical ? to[1] - from[1] - 4 : to[0] - from[0] - 4;
  return (
    <g>
      <path
        d={`M${from[0]} ${from[1]}L${to[0]} ${to[1]}`}
        stroke={BORDER}
        strokeWidth={1.5}
      />
      <path
        d={head}
        stroke={BORDER}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        className={vertical ? styles.dropY : styles.dropX}
        style={delay(at, { '--distance': `${distance}px` })}
        cx={from[0]}
        cy={from[1]}
        r={3.5}
        fill={ACCENT}
      />
    </g>
  );
}

function AppWindow() {
  return (
    <g transform={`translate(${WX - 8} 0)`}>
      <Window x={8} y={8} width={420} height={320} chrome="macos">
        <rect
          x={20}
          y={48}
          width={110}
          height={268}
          rx={6}
          stroke={BORDER}
          strokeDasharray="4 4"
        />
        <Skeleton x={32} y={62} width={86} height={10} radius={5} />
        <Skeleton x={32} y={84} width={66} height={10} radius={5} />
        <Skeleton x={32} y={106} width={76} height={10} radius={5} />
        <Skeleton x={146} y={48} width={270} height={86} radius={6} />
        <text x={146} y={164} fontSize={17} fontWeight={600} fill={TEXT}>
          Meeting notes
        </text>
        <rect
          x={146}
          y={178}
          width={270}
          height={70}
          rx={6}
          stroke={BORDER}
          strokeDasharray="4 4"
        />
        <Skeleton x={158} y={190} width={232} height={8} radius={4} />
        <Skeleton x={158} y={204} width={190} height={8} radius={4} />
        <Skeleton x={158} y={218} width={214} height={8} radius={4} />
        <Skeleton x={158} y={232} width={150} height={8} radius={4} />
        <rect
          x={146}
          y={266}
          width={270}
          height={38}
          rx={6}
          stroke={BORDER}
          strokeWidth={1.5}
        />
        <text x={160} y={290} fontSize={13} fill={TEXT} opacity={0.55}>
          Write something…
        </text>
        {PARTS.map(part => {
          const [x, y, width, height] = part.box;
          return (
            <rect
              key={part.label}
              className={styles.flash}
              style={delay(partAt(part))}
              x={x - 3}
              y={y - 3}
              width={width + 6}
              height={height + 6}
              rx={8}
              fill={ACCENT}
              fillOpacity={0.1}
              stroke={ACCENT}
              strokeWidth={1.5}
            />
          );
        })}
      </Window>
    </g>
  );
}

function Callouts() {
  return (
    <>
      {PARTS.map(part => {
        const [fx, y] = part.from;
        const x = fx + WX - 8;
        return (
          <g key={part.label}>
            <path
              d={`M${x} ${y}H${LABEL_X - 10}`}
              stroke={BORDER}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <circle
              cx={x}
              cy={y}
              r={4}
              fill="var(--home-hero-devices-icon)"
              stroke={BACKGROUND}
              strokeWidth={2}
            />
            <text
              x={LABEL_X}
              y={y + 5}
              fontSize={15}
              fontFamily={MONO}
              fill={TEXT}
            >
              {part.label}
            </text>
            <text
              className={styles.flash}
              style={delay(partAt(part))}
              x={LABEL_X}
              y={y + 5}
              fontSize={15}
              fontFamily={MONO}
              fill={ACCENT}
            >
              {part.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

/**
 * The components in the JSX, the path an update takes through the JS engine,
 * Fabric and GPUI, and the window they end up in.
 */
export default function Anatomy({ className }: { className?: string }) {
  const engineY = CODE_Y + CODE_H + 18;
  const fabricY = engineY + 50;
  const gpuiY = fabricY + 50;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 840 352"
      fill="none"
      role="img"
      aria-label="JSX declaring a View, Image, Text, ScrollView and TextInput runs in the JS engine; Fabric lays it out in C++ with Yoga; GPUI in Rust paints it with the GPU into a desktop window, where each of those components is labelled."
      className={`${styles.anatomy} ${className ?? ''}`}
    >
      <CodeCard />
      <Arrow
        from={[COLUMN_MID, CODE_Y + CODE_H + 1]}
        to={[COLUMN_MID, engineY - 1]}
        at={AT.engine - 0.35}
      />
      <Stage y={engineY} title="JS engine" detail="React" at={AT.engine} />
      <Arrow
        from={[COLUMN_MID, engineY + 33]}
        to={[COLUMN_MID, fabricY - 1]}
        at={AT.fabric - 0.35}
      />
      <Stage y={fabricY} title="Fabric" detail="C++, Yoga" at={AT.fabric} />
      <Arrow
        from={[COLUMN_MID, fabricY + 33]}
        to={[COLUMN_MID, gpuiY - 1]}
        at={AT.gpui - 0.35}
      />
      <Stage y={gpuiY} title="GPUI" detail="Rust, GPU" at={AT.gpui} />
      <Arrow
        from={[COLUMN_X + COLUMN_W + 1, gpuiY + 16]}
        to={[WX - 2, gpuiY + 16]}
        at={AT.paint - 0.45}
      />
      <text
        x={COLUMN_MID}
        y={gpuiY + 52}
        textAnchor="middle"
        fontSize={10}
        fontFamily={MONO}
        fill={MUTED}
      >
        Metal · DirectX · Vulkan
      </text>
      <AppWindow />
      <Callouts />
    </svg>
  );
}
