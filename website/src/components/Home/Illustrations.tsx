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
const COMPACT_TITLE_BAR = 18;

type WindowProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  chrome: Chrome;
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function TitleBar({
  chrome,
  x,
  y,
  width,
  bar,
}: {
  chrome: Chrome;
  x: number;
  y: number;
  width: number;
  bar: number;
}) {
  const mid = y + bar / 2;
  const unit = bar / TITLE_BAR;
  switch (chrome) {
    case 'macos': {
      const r = 5 * unit;
      const gap = 16 * unit;
      return (
        <>
          <circle cx={x + gap} cy={mid} r={r} fill="#ff5f57" />
          <circle cx={x + gap * 2} cy={mid} r={r} fill="#febc2e" />
          <circle cx={x + gap * 3} cy={mid} r={r} fill="#28c840" />
        </>
      );
    }
    case 'windows': {
      const right = x + width;
      const g = 8 * unit;
      const step = 26 * unit;
      return (
        <g stroke={ICON} strokeWidth={1.2} strokeLinecap="round" fill="none">
          <path d={`M${right - step * 3} ${mid}h${g}`} />
          <rect
            x={right - step * 2}
            y={mid - g / 2}
            width={g}
            height={g}
            rx={1.5 * unit}
          />
          <path
            d={`M${right - step} ${mid - g / 2}l${g} ${g}m0 -${g}l-${g} ${g}`}
          />
        </g>
      );
    }
    case 'linux': {
      const right = x + width;
      const r = 7 * unit;
      const g = 2.5 * unit;
      return (
        <>
          <rect
            x={x + width / 2 - 36 * unit}
            y={mid - 3.5 * unit}
            width={72 * unit}
            height={7 * unit}
            rx={3.5 * unit}
            fill={SKELETON}
          />
          <circle cx={right - 16 * unit} cy={mid} r={r} fill={SKELETON} />
          <path
            d={`M${right - 16 * unit - g} ${mid - g}l${g * 2} ${g * 2}m0 -${g * 2}l-${g * 2} ${g * 2}`}
            stroke={ICON}
            strokeWidth={1.2}
            strokeLinecap="round"
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
  compact = false,
  className,
  children,
}: WindowProps) {
  const bar = compact ? COMPACT_TITLE_BAR : TITLE_BAR;
  const radius = chrome === 'windows' ? 6 : compact ? 7 : 10;
  const stroke = compact ? 1.5 : 3;
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
        strokeWidth={stroke}
      />
      <path
        d={`M${x + stroke / 2} ${y + bar}H${x + width - stroke / 2}`}
        stroke={SKELETON}
        strokeWidth={1}
      />
      <TitleBar chrome={chrome} x={x} y={y} width={width} bar={bar} />
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

/** A compact window body: a sidebar list and a content area of skeleton blocks. */
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
  const pad = 10;
  const top = y + COMPACT_TITLE_BAR + pad;
  const inner = height - COMPACT_TITLE_BAR - pad * 2;
  const side = Math.round(width * 0.28);
  const contentX = x + side + pad;
  const contentWidth = width - side - pad * 2;
  const hero = Math.round(inner * 0.5);
  return (
    <>
      <rect
        x={x + 0.75}
        y={y + COMPACT_TITLE_BAR + 0.5}
        width={side}
        height={height - COMPACT_TITLE_BAR - 1.25}
        fill={SKELETON}
        opacity={0.25}
      />
      {[0, 1, 2, 3].map(row => (
        <Skeleton
          key={row}
          x={x + pad}
          y={top + row * 14}
          width={side - pad * 2 - (row % 2) * 10}
          height={6}
          radius={3}
        />
      ))}
      <Skeleton
        x={contentX}
        y={top}
        width={contentWidth}
        height={hero}
        radius={4}
      />
      <Skeleton
        x={contentX}
        y={top + hero + 9}
        width={Math.round(contentWidth * 0.75)}
        height={6}
        radius={3}
      />
      <Skeleton
        x={contentX}
        y={top + hero + 21}
        width={Math.round(contentWidth * 0.5)}
        height={6}
        radius={3}
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
      viewBox="10 10 340 228"
      fill="none"
      role="img"
      aria-label="A desktop window showing the React logo and the text Welcome to React Native on Desktop!"
      className={className}
    >
      <Window x={12} y={12} width={336} height={224} chrome="macos">
        <ReactMark x={150} y={60} size={60} />
        <text
          x={180}
          y={146}
          textAnchor="middle"
          fontSize={19}
          fontWeight={700}
          fill={TEXT}
        >
          Welcome to React Native
        </text>
        <text
          x={180}
          y={169}
          textAnchor="middle"
          fontSize={19}
          fontWeight={700}
          fill={TEXT}
        >
          on Desktop!
        </text>
        <rect
          x={134}
          y={186}
          width={92}
          height={24}
          rx={12}
          fill="var(--ifm-color-primary)"
        />
        <text
          x={180}
          y={202}
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
      <circle
        cx={fromX}
        cy={y}
        r={4}
        fill={ICON}
        stroke={BACKGROUND}
        strokeWidth={2}
      />
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
      </Window>
      <Callout y={91} fromX={392} label="Image" />
      <Callout y={158} fromX={292} label="Text" />
      <Callout y={213} fromX={404} label="ScrollView" />
      <Callout y={257} fromX={75} label="View" />
      <Callout y={285} fromX={404} label="TextInput" />
    </svg>
  );
}

const CARD = { viewBox: '0 0 284 148', fill: 'none', role: 'img' } as const;

function CardBackground() {
  return <rect width={284} height={148} fill={SKELETON} opacity={0.35} />;
}

/** Card illustration: the desktop shell (menu bar, window, context menu, tray). */
export function ShellCard({ className }: { className?: string }) {
  const menu = ['Copy', 'Paste', 'Inspect'];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...CARD}
      aria-label="A window with an application menu, a context menu and a tray icon"
      className={className}
    >
      <CardBackground />
      <rect width={284} height={18} fill={BACKGROUND} opacity={0.9} />
      <path d="M0 18H284" stroke={BORDER} strokeWidth={1} />
      <circle cx={14} cy={9} r={3.5} fill={ICON} />
      <Skeleton x={26} y={6.5} width={22} height={5} radius={2.5} />
      <Skeleton x={56} y={6.5} width={18} height={5} radius={2.5} />
      <Skeleton x={82} y={6.5} width={24} height={5} radius={2.5} />
      <rect
        x={232}
        y={4}
        width={12}
        height={10}
        rx={3}
        fill="var(--ifm-color-primary)"
      />
      <Skeleton x={252} y={6.5} width={22} height={5} radius={2.5} />
      <Window x={22} y={32} width={168} height={100} chrome="macos" compact>
        <AppBody x={22} y={32} width={168} height={100} />
      </Window>
      <g style={SHADOW}>
        <rect
          x={150}
          y={72}
          width={92}
          height={58}
          rx={6}
          fill={BACKGROUND}
          stroke={BORDER}
          strokeWidth={1.5}
        />
      </g>
      {menu.map((label, i) => (
        <g key={label}>
          {i === 1 && (
            <rect
              x={154}
              y={77 + i * 16}
              width={84}
              height={15}
              rx={4}
              fill="var(--ifm-color-primary)"
              opacity={0.3}
            />
          )}
          <text x={162} y={88 + i * 16} fontSize={9} fill={TEXT}>
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Card illustration: JavaScript calling into Rust and C++ modules. */
export function ModulesCard({ className }: { className?: string }) {
  const chip = (cx: number, y: number, label: string, accent = false) => (
    <g>
      <rect
        x={cx - 40}
        y={y}
        width={80}
        height={30}
        rx={8}
        fill={BACKGROUND}
        stroke={accent ? 'var(--ifm-color-primary)' : BORDER}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={y + 19.5}
        textAnchor="middle"
        fontSize={12}
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
      <CardBackground />
      <path
        d="M142 56V74M78 92V82a8 8 0 0 1 8 -8H198a8 8 0 0 1 8 8V92"
        stroke={BORDER}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx={142} cy={74} r={3} fill={BORDER} />
      {chip(142, 26, 'JS', true)}
      {chip(78, 92, 'Rust')}
      {chip(206, 92, 'C++')}
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
      <CardBackground />
      <Window x={16} y={18} width={150} height={74} chrome="macos" compact>
        <text x={26} y={52} fontSize={9} fontFamily={MONO} fill={TEXT}>
          <tspan fill="var(--home-code-green)">$</tspan> run-desktop
        </text>
        <text
          x={26}
          y={68}
          fontSize={9}
          fontFamily={MONO}
          fill={TEXT}
          opacity={0.55}
        >
          Metro ready
        </text>
        <rect x={26} y={74} width={6} height={10} fill={TEXT} opacity={0.7} />
      </Window>
      <g style={SHADOW}>
        <rect
          x={140}
          y={50}
          width={128}
          height={84}
          rx={7}
          fill={BACKGROUND}
          stroke={BORDER}
          strokeWidth={1.5}
        />
      </g>
      <text x={152} y={67} fontSize={9} fontWeight={600} fill={TEXT}>
        Dev Menu
      </text>
      {[0, 1, 2].map(row => {
        const on = row !== 1;
        const y = 80 + row * 17;
        return (
          <g key={row}>
            <Skeleton
              x={152}
              y={y + 2}
              width={52 - row * 8}
              height={6}
              radius={3}
            />
            <rect
              x={234}
              y={y}
              width={22}
              height={11}
              rx={5.5}
              fill={on ? 'var(--ifm-color-primary)' : SKELETON}
            />
            <circle
              cx={on ? 250.5 : 239.5}
              cy={y + 5.5}
              r={4}
              fill={on ? 'var(--home-button-primary-text)' : ICON}
            />
          </g>
        );
      })}
    </svg>
  );
}
