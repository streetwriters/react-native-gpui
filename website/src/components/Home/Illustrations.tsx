/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

const BORDER = 'var(--home-hero-devices-border)';
const BACKGROUND = 'var(--home-hero-devices-background)';
const SKELETON = 'var(--home-hero-devices-skeleton-element)';
const ICON = 'var(--home-hero-devices-icon)';
const TEXT = 'var(--ifm-font-color-base)';
const MONO = 'var(--ifm-font-family-monospace)';
const SHADOW = { filter: 'drop-shadow(0 16px 16px rgb(0 0 0 / 0.1))' };

export type Chrome = 'macos' | 'windows' | 'linux';

const TITLE_BAR = 28;

type WindowProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  chrome: Chrome;
  className?: string;
  children?: React.ReactNode;
};

function TitleBar({
  chrome,
  x,
  y,
  width,
}: {
  chrome: Chrome;
  x: number;
  y: number;
  width: number;
}) {
  const mid = y + TITLE_BAR / 2;
  switch (chrome) {
    case 'macos':
      return (
        <>
          <circle cx={x + 16} cy={mid} r={5} fill="#ff5f57" />
          <circle cx={x + 32} cy={mid} r={5} fill="#febc2e" />
          <circle cx={x + 48} cy={mid} r={5} fill="#28c840" />
        </>
      );
    case 'windows': {
      const right = x + width;
      return (
        <g stroke={ICON} strokeWidth={1.4} fill="none">
          <path d={`M${right - 78} ${mid}h9`} />
          <rect x={right - 49} y={mid - 4.5} width={9} height={9} />
          <path d={`M${right - 22} ${mid - 4.5}l9 9m0 -9l-9 9`} />
        </g>
      );
    }
    case 'linux': {
      const right = x + width;
      return (
        <>
          <rect
            x={x + width / 2 - 40}
            y={mid - 4}
            width={80}
            height={8}
            rx={4}
            fill={SKELETON}
          />
          <circle cx={right - 16} cy={mid} r={7} fill={SKELETON} />
          <path
            d={`M${right - 18.5} ${mid - 2.5}l5 5m0 -5l-5 5`}
            stroke={ICON}
            strokeWidth={1.4}
          />
        </>
      );
    }
  }
}

function Window({
  x,
  y,
  width,
  height,
  chrome,
  className,
  children,
}: WindowProps) {
  const radius = chrome === 'windows' ? 2 : 10;
  return (
    <g className={className} style={SHADOW}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={3}
      />
      <path
        d={`M${x} ${y + TITLE_BAR}H${x + width}`}
        stroke={SKELETON}
        strokeWidth={1.5}
      />
      <TitleBar chrome={chrome} x={x} y={y} width={width} />
      {children}
    </g>
  );
}

function Skeleton({
  x,
  y,
  width,
  height,
  radius = 5,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={radius}
      fill={SKELETON}
    />
  );
}

/** A window body: a sidebar and a content area made of skeleton blocks. */
function AppBody({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const top = y + TITLE_BAR + 12;
  const side = Math.round(width * 0.26);
  const contentX = x + side + 24;
  const contentWidth = width - side - 36;
  const rows = Math.floor((height - TITLE_BAR - 24) / 26);
  return (
    <>
      {Array.from({ length: Math.min(rows, 6) }, (_, row) => (
        <Skeleton
          key={row}
          x={x + 12}
          y={top + row * 26}
          width={side - (row % 3) * 10}
          height={14}
          radius={7}
        />
      ))}
      <Skeleton
        x={contentX}
        y={top}
        width={contentWidth}
        height={Math.round((height - TITLE_BAR - 24) * 0.5)}
      />
      <Skeleton
        x={contentX}
        y={top + Math.round((height - TITLE_BAR - 24) * 0.5) + 12}
        width={Math.round(contentWidth * 0.7)}
        height={12}
        radius={6}
      />
      <Skeleton
        x={contentX}
        y={top + Math.round((height - TITLE_BAR - 24) * 0.5) + 32}
        width={Math.round(contentWidth * 0.5)}
        height={12}
        radius={6}
      />
    </>
  );
}

/** The React logo, drawn in the logo colour. */
function ReactMark({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 112;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      stroke="var(--logo)"
      strokeWidth={5.333}
    >
      <circle cx={56} cy={51.165} r={10.667} fill="var(--logo)" stroke="none" />
      <path d="M56 75.165c29.455 0 53.333-10.745 53.333-24s-23.878-24-53.333-24-53.334 10.745-53.334 24 23.879 24 53.334 24Z" />
      <path d="M35.215 63.165c14.728 25.509 35.972 40.815 47.451 34.188 11.48-6.628 8.846-32.68-5.882-58.188-14.727-25.51-35.972-40.816-47.45-34.188-11.48 6.627-8.846 32.679 5.881 58.188Z" />
      <path d="M35.215 39.165c-14.727 25.509-17.36 51.56-5.882 58.188 11.48 6.627 32.724-8.68 47.451-34.188 14.728-25.51 17.362-51.56 5.883-58.188-11.48-6.628-32.724 8.679-47.452 34.188Z" />
    </g>
  );
}

/** The window the example code renders. */
export function HelloWindow({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 260"
      fill="none"
      role="img"
      aria-label="A desktop window showing the React logo and the text Welcome to React Native on Desktop!"
      className={className}
    >
      <Window x={12} y={12} width={336} height={224} chrome="macos">
        <ReactMark x={145} y={46} size={70} />
        <text
          x={180}
          y={142}
          textAnchor="middle"
          fontSize={19}
          fontWeight={700}
          fill={TEXT}
        >
          Welcome to React Native
        </text>
        <text
          x={180}
          y={165}
          textAnchor="middle"
          fontSize={19}
          fontWeight={700}
          fill={TEXT}
        >
          on Desktop!
        </text>
        <rect
          x={134}
          y={184}
          width={92}
          height={24}
          rx={12}
          fill="var(--ifm-color-primary)"
        />
        <text
          x={180}
          y={200}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--home-button-primary-text)"
        >
          Get started
        </text>
      </Window>
    </svg>
  );
}

function Callout({
  y,
  fromX,
  label,
}: {
  y: number;
  fromX: number;
  label: string;
}) {
  return (
    <>
      <path
        d={`M${fromX} ${y}H452`}
        stroke={BORDER}
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <circle cx={fromX} cy={y} r={4} fill={BORDER} />
      <text x={462} y={y + 5} fontSize={15} fontFamily={MONO} fill={TEXT}>
        {label}
      </text>
    </>
  );
}

/** A window with its UI pointed out as core components. */
export function ComponentAnatomy({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 340"
      fill="none"
      role="img"
      aria-label="A desktop window with its elements labelled View, Text, Image, ScrollView and TextInput"
      className={className}
    >
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
        <Skeleton x={30} y={60} width={90} height={12} radius={6} />
        <Skeleton x={30} y={84} width={70} height={12} radius={6} />
        <Skeleton x={30} y={108} width={80} height={12} radius={6} />
        <Skeleton x={146} y={48} width={268} height={90} />
        <text x={160} y={162} fontSize={17} fontWeight={600} fill={TEXT}>
          Meeting notes
        </text>
        <Skeleton x={146} y={176} width={268} height={10} radius={5} />
        <Skeleton x={146} y={194} width={210} height={10} radius={5} />
        <Skeleton x={146} y={212} width={240} height={10} radius={5} />
        <Skeleton x={146} y={230} width={180} height={10} radius={5} />
        <rect
          x={146}
          y={262}
          width={268}
          height={40}
          rx={6}
          stroke={BORDER}
          strokeWidth={1.5}
        />
        <text x={158} y={287} fontSize={14} fill={TEXT} opacity={0.6}>
          Write something…
        </text>
        <rect
          x={146}
          y={170}
          width={268}
          height={78}
          rx={4}
          stroke={BORDER}
          strokeDasharray="4 4"
        />
      </Window>
      <Callout y={140} fromX={80} label="View" />
      <Callout y={70} fromX={280} label="Image" />
      <Callout y={163} fromX={265} label="Text" />
      <Callout y={209} fromX={400} label="ScrollView" />
      <Callout y={282} fromX={410} label="TextInput" />
    </svg>
  );
}

const CARD = { viewBox: '0 0 284 148', fill: 'none', role: 'img' } as const;

/** Card illustration: the desktop shell (menu bar, window, tray). */
export function ShellCard({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...CARD}
      aria-label="A window with an application menu, a context menu and a tray icon"
      className={className}
    >
      <rect width={284} height={148} fill={SKELETON} opacity={0.35} />
      <rect x={0} y={0} width={284} height={16} fill={BACKGROUND} />
      <Skeleton x={10} y={5} width={28} height={6} radius={3} />
      <Skeleton x={46} y={5} width={28} height={6} radius={3} />
      <Skeleton x={82} y={5} width={28} height={6} radius={3} />
      <circle cx={246} cy={8} r={4} fill={ICON} />
      <rect x={256} y={4} width={18} height={8} rx={2} fill={SKELETON} />
      <Window x={30} y={30} width={170} height={104} chrome="windows">
        <AppBody x={30} y={30} width={170} height={104} />
      </Window>
      <g style={SHADOW}>
        <rect
          x={146}
          y={70}
          width={100}
          height={64}
          rx={6}
          fill={BACKGROUND}
          stroke={BORDER}
          strokeWidth={2}
        />
      </g>
      <Skeleton x={156} y={80} width={60} height={8} radius={4} />
      <Skeleton x={156} y={98} width={74} height={8} radius={4} />
      <Skeleton x={156} y={116} width={50} height={8} radius={4} />
    </svg>
  );
}

/** Card illustration: JavaScript calling into Rust and C++ modules. */
export function ModulesCard({ className }: { className?: string }) {
  const chip = (x: number, y: number, label: string) => (
    <g>
      <rect
        x={x}
        y={y}
        width={86}
        height={34}
        rx={8}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={2}
      />
      <text
        x={x + 43}
        y={y + 22}
        textAnchor="middle"
        fontSize={14}
        fontFamily={MONO}
        fill={TEXT}
      >
        {label}
      </text>
    </g>
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...CARD}
      aria-label="JavaScript calling native modules written in Rust and C++"
      className={className}
    >
      <rect width={284} height={148} fill={SKELETON} opacity={0.35} />
      <path
        d="M129 57 L90 91 M155 57 L194 91"
        stroke={BORDER}
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      {chip(99, 24, 'JS')}
      {chip(30, 88, 'Rust')}
      {chip(168, 88, 'C++')}
    </svg>
  );
}

/** Card illustration: the CLI and the dev menu. */
export function ToolsCard({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...CARD}
      aria-label="The run-desktop command and a developer menu with toggles"
      className={className}
    >
      <rect width={284} height={148} fill={SKELETON} opacity={0.35} />
      <rect
        x={16}
        y={20}
        width={140}
        height={50}
        rx={8}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={2}
      />
      <text x={28} y={50} fontSize={11} fontFamily={MONO} fill={TEXT}>
        $ run-desktop
      </text>
      <rect
        x={128}
        y={46}
        width={140}
        height={86}
        rx={8}
        fill={BACKGROUND}
        stroke={BORDER}
        strokeWidth={2}
      />
      {[0, 1, 2].map(row => (
        <g key={row}>
          <Skeleton
            x={140}
            y={60 + row * 22}
            width={60 + row * 8}
            height={8}
            radius={4}
          />
          <rect
            x={230}
            y={56 + row * 22}
            width={26}
            height={14}
            rx={7}
            fill={row === 1 ? BORDER : SKELETON}
          />
          <circle
            cx={row === 1 ? 249 : 237}
            cy={63 + row * 22}
            r={5}
            fill={BACKGROUND}
          />
        </g>
      ))}
    </svg>
  );
}
