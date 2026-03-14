import type { Classification } from '@rabbithole/shared-types';
import { classificationCopy } from '@/sidebar/lib/classifications';

export type RabbitDisplayState = Classification | 'LISTENING' | 'WAITING' | 'ANALYZING';

const liveStateCopy: Record<
  Exclude<RabbitDisplayState, Classification>,
  { label: string; accent: string; fill: string }
> = {
  LISTENING: {
    label: 'Listening',
    accent: '#9dd6ff',
    fill: 'rgba(157, 214, 255, 0.18)',
  },
  WAITING: {
    label: 'Waiting',
    accent: '#f4cd68',
    fill: 'rgba(244, 205, 104, 0.18)',
  },
  ANALYZING: {
    label: 'Analyzing',
    accent: '#9be6c8',
    fill: 'rgba(155, 230, 200, 0.2)',
  },
};

function isClassificationState(state: RabbitDisplayState): state is Classification {
  return state in classificationCopy;
}

export function rabbitDisplayCopy(state: RabbitDisplayState) {
  if (isClassificationState(state)) {
    const classification = classificationCopy[state];
    return {
      label: classification.label,
      accent: classification.accent,
      fill: classification.fill,
    };
  }

  return liveStateCopy[state];
}

export function rabbitMotionForState(state: RabbitDisplayState) {
  switch (state) {
    case 'DEEPENING':
      return { y: [0, -4, 0], rotate: [0, 2.5, 0], scale: [1, 1.03, 1] };
    case 'SIDE_QUEST':
      return { rotate: [0, -7, 7, 0], x: [0, -1, 1, 0], scale: [1, 1.03, 1] };
    case 'RABBIT_HOLE':
      return { y: [0, 10, -2, 0], rotate: [0, -12, 4, 0], scale: [1, 0.96, 1] };
    case 'RETURN_TO_PATH':
      return { y: [0, -7, 0], rotate: [0, 4, 0], scale: [1, 1.04, 1] };
    case 'LISTENING':
      return { y: [0, -3, 0], rotate: [0, -3, 3, 0], scale: [1, 1.02, 1] };
    case 'WAITING':
      return { y: [0, -2, 0], x: [0, 1, -1, 0], scale: [1, 1.01, 1] };
    case 'ANALYZING':
      return { y: [0, -2, 0], rotate: [0, 4, -4, 0], scale: [1, 1.04, 1] };
    default:
      return { y: [0, -5, 0], rotate: [0, 1.5, 0], scale: [1, 1.02, 1] };
  }
}

function RabbitFace({ color, state }: { color: string; state: RabbitDisplayState }) {
  if (state === 'LISTENING') {
    return (
      <>
        <circle cx="20" cy="27.5" r="1.8" fill={color} />
        <circle cx="28" cy="27.5" r="1.8" fill={color} />
        <path d="M20 33.5c1.5-1.7 6.5-1.7 8 0" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.1" />
      </>
    );
  }

  if (state === 'WAITING') {
    return (
      <>
        <ellipse cx="20" cy="27.2" rx="1.8" ry="2.2" fill={color} />
        <ellipse cx="28" cy="27.2" rx="1.8" ry="2.2" fill={color} />
        <path d="M20 34h8" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.1" />
      </>
    );
  }

  if (state === 'ANALYZING') {
    return (
      <>
        <path d="M18.2 26.8h3.6M26.2 26.8h3.6" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.2" />
        <path d="M19.6 33c1.2-1.4 2.7-2.1 4.4-2.1 1.8 0 3.2.7 4.5 2.1" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.1" />
      </>
    );
  }

  if (state === 'SIDE_QUEST') {
    return (
      <>
        <circle cx="19.5" cy="27.6" r="1.7" fill={color} />
        <ellipse cx="28.5" cy="27.3" rx="1.5" ry="1.9" fill={color} />
        <path d="M19.5 34c2.2 1 5.3.6 7.5-1" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.1" />
      </>
    );
  }

  if (state === 'RABBIT_HOLE') {
    return (
      <>
        <circle cx="20" cy="27.2" r="1.9" fill={color} />
        <circle cx="28" cy="27.2" r="1.9" fill={color} />
        <path d="M18.2 24.3l3.1-1.2M26.7 23.1l3.1 1.2" fill="none" stroke={color} strokeLinecap="round" strokeWidth="1.8" />
        <path d="M20 35.2c1.7-2.2 6.3-2.2 8 0" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.1" />
      </>
    );
  }

  if (state === 'RETURN_TO_PATH') {
    return (
      <>
        <circle cx="20" cy="27.5" r="1.7" fill={color} />
        <circle cx="28" cy="27.5" r="1.7" fill={color} />
        <path d="M19 33.2c2.4 2.6 7.1 2.6 10 0" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.2" />
      </>
    );
  }

  if (state === 'DEEPENING') {
    return (
      <>
        <path d="M18.7 26.8h2.8M26.5 26.8h2.8" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.2" />
        <path d="M19.5 33.8c2.2 1.8 6.9 1.8 9 0" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.1" />
      </>
    );
  }

  return (
    <>
      <circle cx="20" cy="27.5" r="1.7" fill={color} />
      <circle cx="28" cy="27.5" r="1.7" fill={color} />
      <path d="M20 33.5c2 1.7 6 1.7 8 0" fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.1" />
    </>
  );
}

export function RabbitGlyph({
  color,
  state,
  className,
}: {
  color: string;
  state: RabbitDisplayState;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className ?? 'h-8 w-8 drop-shadow-[0_10px_20px_rgba(0,0,0,0.28)]'}
      aria-hidden="true"
    >
      <path
        d="M22 13c0-5 2-9 5-9 3 0 4 5 3 10l-1 4M16 15c-2-5-2-10 1-11 3-1 5 3 6 8l1 5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M11 28c0-7 6-12 13-12s13 5 13 12-6 13-13 13S11 35 11 28Z"
        fill="rgba(255,255,255,0.95)"
        stroke={color}
        strokeWidth="3"
      />
      <RabbitFace color={color} state={state} />
    </svg>
  );
}
