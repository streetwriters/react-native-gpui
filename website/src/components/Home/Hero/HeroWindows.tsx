/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

import styles from './styles.module.css';

const BORDER = 'var(--home-hero-devices-border)';
const BACKGROUND = 'var(--home-hero-devices-background)';
const SKELETON = 'var(--home-hero-devices-skeleton-element)';
const ICON = 'var(--home-hero-devices-icon)';
const TEXT = 'var(--ifm-font-color-base)';
const ACCENT = 'var(--ifm-color-primary)';
const MONO = 'var(--ifm-font-family-monospace)';
const SHADOW = { filter: 'drop-shadow(0 16px 16px rgb(0 0 0 / 0.12))' };

function Bar({
  x,
  y,
  width,
  height = 8,
  fill = SKELETON,
}: {
  x: number;
  y: number;
  width: number;
  height?: number;
  fill?: string;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={height / 2}
      fill={fill}
    />
  );
}

/** macOS: traffic lights, a translucent sidebar and a toolbar. Hover swaps the list for a grid. */
function MacWindow({ className }: { className?: string }) {
  const x = 30;
  const y = 70;
  const w = 360;
  const h = 188;
  const side = 104;
  const items = ['Inbox', 'Drafts', 'Sent', 'Archive'];
  return (
    <g className={`${styles.win} ${className ?? ''}`} style={SHADOW}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={3}
      />
      <path
        d={`M${x + 1.5} ${y + 12}a10.5 10.5 0 0 1 10.5 -10.5H${x + side}V${y + h - 1.5}H${x + 12}a10.5 10.5 0 0 1 -10.5 -10.5Z`}
        fill={SKELETON}
        opacity={0.45}
      />
      <circle cx={x + 16} cy={y + 16} r={5} fill="#ff5f57" />
      <circle cx={x + 32} cy={y + 16} r={5} fill="#febc2e" />
      <circle cx={x + 48} cy={y + 16} r={5} fill="#28c840" />
      {items.map((item, i) => (
        <g key={item}>
          <rect
            x={x + 8}
            y={y + 40 + i * 26}
            width={side - 16}
            height={22}
            rx={6}
            fill={ACCENT}
            fillOpacity={i === 0 ? 0.28 : 0.001}
            className={styles.base}
          />
          <rect
            x={x + 8}
            y={y + 40 + i * 26}
            width={side - 16}
            height={22}
            rx={6}
            fill={ACCENT}
            fillOpacity={0.28}
            className={styles.alt}
          />
          <circle
            cx={x + 22}
            cy={y + 51 + i * 26}
            r={5}
            fill={ICON}
            opacity={0.55}
          />
          <text x={x + 34} y={y + 55 + i * 26} fontSize={11} fill={TEXT}>
            {item}
          </text>
        </g>
      ))}
      <text
        x={x + side + 16}
        y={y + 22}
        fontSize={13}
        fontWeight={600}
        fill={TEXT}
      >
        Inbox
      </text>
      <path
        d={`M${x + side} ${y + 32}H${x + w - 1.5}`}
        stroke={SKELETON}
        strokeWidth={1.5}
      />
      <g className={styles.base}>
        {[0, 1, 2, 3].map(i => (
          <g key={i}>
            <circle
              cx={x + side + 26}
              cy={y + 56 + i * 34}
              r={11}
              fill={SKELETON}
            />
            <Bar
              x={x + side + 46}
              y={y + 48 + i * 34}
              width={90 - (i % 2) * 18}
              height={9}
              fill={TEXT}
            />
            <rect
              x={x + side + 46}
              y={y + 63 + i * 34}
              width={150 - (i % 3) * 20}
              height={7}
              rx={3.5}
              fill={SKELETON}
            />
          </g>
        ))}
      </g>
      <g className={styles.alt}>
        {[0, 1, 2, 3].map(i => (
          <g key={i}>
            <rect
              x={x + side + 16 + (i % 2) * 118}
              y={y + 44 + Math.floor(i / 2) * 68}
              width={108}
              height={58}
              rx={8}
              fill={SKELETON}
            />
            <Bar
              x={x + side + 26 + (i % 2) * 118}
              y={y + 54 + Math.floor(i / 2) * 68}
              width={56}
              height={8}
              fill={i === 0 ? ACCENT : TEXT}
            />
            <Bar
              x={x + side + 26 + (i % 2) * 118}
              y={y + 72 + Math.floor(i / 2) * 68}
              width={80}
              height={6}
            />
            <Bar
              x={x + side + 26 + (i % 2) * 118}
              y={y + 84 + Math.floor(i / 2) * 68}
              width={50}
              height={6}
            />
          </g>
        ))}
      </g>
    </g>
  );
}

/** Windows 11: a tab strip, navigation rail and a dashboard. Hover re-draws the chart. */
function WindowsWindow() {
  const x = 330;
  const y = 14;
  const w = 450;
  const h = 244;
  const heights = [34, 52, 28, 66, 44, 58, 38];
  const altHeights = [60, 30, 70, 40, 72, 36, 64];
  return (
    <g className={styles.win} style={SHADOW}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={3}
      />
      <path
        d={`M${x + 1.5} ${y + 34}V${y + 9.5}a8 8 0 0 1 8 -8H${x + w - 9.5}a8 8 0 0 1 8 8V${y + 34}Z`}
        fill={SKELETON}
        opacity={0.6}
      />
      <path
        d={`M${x + 8} ${y + 34}V${y + 14}a6 6 0 0 1 6 -6H${x + 128}a6 6 0 0 1 6 6V${y + 34}Z`}
        fill={BACKGROUND}
      />
      <rect x={x + 18} y={y + 17} width={9} height={9} rx={2} fill={ACCENT} />
      <text x={x + 34} y={y + 25} fontSize={10} fill={TEXT}>
        Dashboard
      </text>
      <g stroke={ICON} strokeWidth={1.2} strokeLinecap="round" fill="none">
        <path d={`M${x + 116} ${y + 18.5}l5 5m0 -5l-5 5`} />
        <path d={`M${x + 146} ${y + 21}h8m-4 -4v8`} />
        <path d={`M${x + w - 107} ${y + 17}h8`} />
        <rect x={x + w - 71} y={y + 13} width={8} height={8} rx={1.5} />
        <path d={`M${x + w - 35} ${y + 13}l8 8m0 -8l-8 8`} />
      </g>
      <rect
        x={x + 1.5}
        y={y + 34}
        width={44}
        height={h - 35.5}
        fill={SKELETON}
        opacity={0.3}
      />
      {[0, 1, 2, 3].map(i => (
        <rect
          key={i}
          x={x + 15}
          y={y + 50 + i * 30}
          width={16}
          height={16}
          rx={4}
          fill={i === 0 ? ACCENT : SKELETON}
          opacity={i === 0 ? 1 : 0.8}
        />
      ))}
      <text x={x + 62} y={y + 62} fontSize={15} fontWeight={600} fill={TEXT}>
        Dashboard
      </text>
      {[0, 1, 2].map(i => (
        <g key={i}>
          <rect
            x={x + 62 + i * 126}
            y={y + 72}
            width={116}
            height={52}
            rx={6}
            fill={SKELETON}
            opacity={0.55}
          />
          <Bar
            x={x + 72 + i * 126}
            y={y + 82}
            width={42}
            height={6}
            fill={TEXT}
          />
          <text
            x={x + 72 + i * 126}
            y={y + 110}
            fontSize={16}
            fontWeight={600}
            fill={TEXT}
          >
            {['2,418', '86%', '312'][i]}
          </text>
          <polyline
            fill="none"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={`${x + 124 + i * 126},${y + 110} ${x + 133 + i * 126},${y + 102} ${x + 142 + i * 126},${y + 106} ${x + 151 + i * 126},${y + 95} ${x + 160 + i * 126},${y + 99}`}
          />
        </g>
      ))}
      <rect
        x={x + 62}
        y={y + 134}
        width={376}
        height={96}
        rx={6}
        fill={SKELETON}
        opacity={0.35}
      />
      {heights.map((height, i) => (
        <g key={i}>
          <rect
            className={styles.bar}
            x={x + 80 + i * 50}
            y={y + 222 - 74}
            width={26}
            height={74}
            rx={4}
            fill={ACCENT}
            opacity={0.85}
            style={
              {
                '--rest': height / 74,
                '--hover': altHeights[i] / 74,
              } as React.CSSProperties
            }
          />
        </g>
      ))}
    </g>
  );
}

/** Linux: a GNOME-style header bar over a code editor. Hover opens a context menu. */
function LinuxWindow() {
  const x = 772;
  const y = 70;
  const w = 340;
  const h = 188;
  const R = 'var(--home-code-red)';
  const P = 'var(--home-code-purple)';
  const G = 'var(--home-code-green)';
  const lines: [string, string | null][][] = [
    [
      ['import ', R],
      ['{View, Text} ', null],
      ['from ', R],
      ["'react-native'", G],
      [';', null],
    ],
    [
      ['export function ', R],
      ['App', P],
      ['() {', null],
    ],
    [['  return (', null]],
    [
      ['    <', null],
      ['View', G],
      [' style={styles.root}>', null],
    ],
    [
      ['      <', null],
      ['Text', G],
      ['>Hello, desktop!</', null],
      ['Text', G],
      ['>', null],
    ],
    [
      ['    </', null],
      ['View', G],
      ['>', null],
    ],
    [['  );', null]],
    [['}', null]],
  ];
  return (
    <g className={styles.win} style={SHADOW}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={3}
      />
      <path
        d={`M${x + 1.5} ${y + 40}V${y + 13.5}a12 12 0 0 1 12 -12H${x + w - 13.5}a12 12 0 0 1 12 12V${y + 40}Z`}
        fill={SKELETON}
        opacity={0.6}
      />
      <rect
        x={x + 10}
        y={y + 10}
        width={24}
        height={20}
        rx={6}
        fill={BACKGROUND}
        opacity={0.7}
      />
      <text
        x={x + w / 2}
        y={y + 24}
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
        fill={TEXT}
      >
        App.tsx
      </text>
      <circle
        cx={x + w - 46}
        cy={y + 20}
        r={8}
        fill={BACKGROUND}
        opacity={0.7}
      />
      <circle
        cx={x + w - 20}
        cy={y + 20}
        r={8}
        fill={BACKGROUND}
        opacity={0.7}
      />
      <g stroke={ICON} strokeWidth={1.2} strokeLinecap="round" fill="none">
        <path d={`M${x + 22} ${y + 16}v8m-4 -4h8`} />
        <circle cx={x + w - 47} cy={y + 19} r={3} />
        <path d={`M${x + w - 44.8} ${y + 21.2}l2.3 2.3`} />
        <path d={`M${x + w - 23} ${y + 17}l6 6m0 -6l-6 6`} />
      </g>
      <rect
        x={x + 1.5}
        y={y + 40}
        width={30}
        height={h - 41.5}
        fill={SKELETON}
        opacity={0.3}
      />
      <rect
        x={x + 1.5}
        y={y + 40 + 15}
        width={w - 3}
        height={16}
        fill={ACCENT}
        fillOpacity={0.14}
        className={styles.base}
      />
      <rect
        x={x + 1.5}
        y={y + 40 + 47}
        width={w - 3}
        height={16}
        fill={ACCENT}
        fillOpacity={0.14}
        className={styles.alt}
      />
      {lines.map((segments, i) => (
        <g key={i}>
          <text
            x={x + 12}
            y={y + 56 + i * 16}
            fontSize={10}
            fontFamily={MONO}
            fill={TEXT}
            opacity={0.45}
          >
            {i + 1}
          </text>
          <text
            x={x + 40}
            y={y + 56 + i * 16}
            fontSize={10.5}
            fontFamily={MONO}
            fill={TEXT}
            style={{ whiteSpace: 'pre' }}
          >
            {segments.map(([text, color], j) => (
              <tspan key={j} fill={color ?? TEXT}>
                {text}
              </tspan>
            ))}
          </text>
        </g>
      ))}
      <g className={styles.alt}>
        <rect
          x={x + 150}
          y={y + 98}
          width={120}
          height={78}
          rx={8}
          fill={BACKGROUND}
          stroke={BORDER}
          strokeWidth={2}
          style={SHADOW}
        />
        {['Copy', 'Paste', 'Go to definition'].map((label, i) => (
          <g key={label}>
            {i === 2 && (
              <rect
                x={x + 156}
                y={y + 98 + 6 + i * 22}
                width={108}
                height={20}
                rx={5}
                fill={ACCENT}
                opacity={0.25}
              />
            )}
            <text
              x={x + 164}
              y={y + 98 + 20 + i * 22}
              fontSize={10.5}
              fill={TEXT}
            >
              {label}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
}

/** Three app windows, one per desktop platform, that react to the pointer. */
export default function HeroWindows({
  className,
  sideClassName,
}: {
  className?: string;
  sideClassName?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={1142}
      height={288}
      fill="none"
      role="img"
      aria-label="App windows in the macOS, Windows and Linux styles"
      className={className}
    >
      <MacWindow className={sideClassName} />
      <LinuxWindowWrapper className={sideClassName} />
      <WindowsWindow />
    </svg>
  );
}

function LinuxWindowWrapper({ className }: { className?: string }) {
  return (
    <g className={className}>
      <LinuxWindow />
    </g>
  );
}
