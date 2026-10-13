import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type Matrix,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

/** Custom event name dispatched on `window` when cheating is detected. */
export const CHEATING_EVENT = 'interview-cheating';

export type CheatingReason =
  | 'multiple_faces'
  | 'head_turn'
  | 'gaze_away'
  | 'no_face';

export interface CheatingEventDetail {
  flag: true;
  reason: CheatingReason;
  message: string;
  metrics?: Record<string, number>;
  timestamp: number;
}

export type CheatingListener = (detail: CheatingEventDetail) => void;

export interface CheatingDetectorOptions {
  /** Inference rate. Keep low to avoid CPU overuse. Default 2.5 */
  fps?: number;
  /** Max faces the landmarker will track. Default 3 */
  numFaces?: number;
  /** Consecutive hits required before emitting (temporal smoothing). */
  confirmFrames?: {
    multipleFaces?: number;
    headTurn?: number;
    gazeAway?: number;
    noFace?: number;
  };
  /** Minimum seconds between duplicate emissions of the same reason. */
  emitCooldownMs?: number;
  onCheating?: CheatingListener;
}

// Landmark indices (MediaPipe Face Mesh with iris)
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_OUTER = 263;
const RIGHT_EYE_INNER = 362;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

/** Head yaw beyond this (degrees) is treated as looking away — not reading on-screen. */
const HEAD_YAW_THRESHOLD_DEG = 38;
/** Pitch: looking far down (phone/notes) or far up. Mild downward glance while reading is OK. */
const HEAD_PITCH_THRESHOLD_DEG = 28;

/**
 * Horizontal iris offset from eye center in [-0.5, 0.5].
 * Reading across a wide monitor stays inside ~±0.28; off-screen / second-monitor glances exceed this.
 */
const GAZE_HORIZONTAL_THRESHOLD = 0.32;
/** Vertical iris offset — mild downward gaze while reading is allowed. */
const GAZE_VERTICAL_THRESHOLD = 0.28;

/** Blendshape score above which we treat the eye as blinking / closed (skip gaze). */
const BLINK_BLENDSHAPE_THRESHOLD = 0.45;
/** Ear-style openness below this also counts as blink / heavy fatigue — skip gaze. */
const EYE_OPENNESS_MIN = 0.12;

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

function blendshapeScore(
  result: FaceLandmarkerResult,
  faceIndex: number,
  name: string
): number {
  const cats = result.faceBlendshapes?.[faceIndex]?.categories;
  if (!cats) return 0;
  const hit = cats.find((c) => c.categoryName === name);
  return hit?.score ?? 0;
}

function extractEuler(matrix: Matrix): { yaw: number; pitch: number; roll: number } {
  const d = matrix.data;
  // Row-major 4×4 rotation
  const r01 = d[1];
  const r11 = d[5];
  const r20 = d[8];
  const r21 = d[9];
  const r22 = d[10];

  const pitch = Math.asin(Math.max(-1, Math.min(1, -r21))) * (180 / Math.PI);
  const yaw = Math.atan2(r20, r22) * (180 / Math.PI);
  const roll = Math.atan2(r01, r11) * (180 / Math.PI);
  return { yaw, pitch, roll };
}

function eyeOpenness(
  landmarks: NormalizedLandmark[],
  topIdx: number,
  bottomIdx: number,
  outerIdx: number,
  innerIdx: number
): number {
  const top = landmarks[topIdx];
  const bottom = landmarks[bottomIdx];
  const outer = landmarks[outerIdx];
  const inner = landmarks[innerIdx];
  if (!top || !bottom || !outer || !inner) return 1;
  const vert = Math.hypot(top.x - bottom.x, top.y - bottom.y);
  const horiz = Math.hypot(outer.x - inner.x, outer.y - inner.y);
  if (horiz < 1e-6) return 1;
  return vert / horiz;
}

function irisOffset(
  landmarks: NormalizedLandmark[],
  irisIdx: number,
  outerIdx: number,
  innerIdx: number,
  topIdx: number,
  bottomIdx: number
): { h: number; v: number } | null {
  const iris = landmarks[irisIdx];
  const outer = landmarks[outerIdx];
  const inner = landmarks[innerIdx];
  const top = landmarks[topIdx];
  const bottom = landmarks[bottomIdx];
  if (!iris || !outer || !inner || !top || !bottom) return null;

  const eyeW = outer.x - inner.x;
  const eyeH = bottom.y - top.y;
  if (Math.abs(eyeW) < 1e-6 || Math.abs(eyeH) < 1e-6) return null;

  // Normalized so 0 = center of eye. Sign depends on camera mirror; we use abs for thresholds.
  const h = (iris.x - (inner.x + outer.x) / 2) / eyeW;
  const v = (iris.y - (top.y + bottom.y) / 2) / eyeH;
  return { h, v };
}

function emitCheating(detail: CheatingEventDetail, onCheating?: CheatingListener) {
  console.log('cheating flag:', detail.reason, '—', detail.message, detail.metrics ?? '');
  onCheating?.(detail);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHEATING_EVENT, { detail }));
  }
}

export class CheatingDetector {
  private landmarker: FaceLandmarker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private video: HTMLVideoElement | null = null;
  private lastTimestamp = -1;
  private disposed = false;
  private readonly options: Required<
    Pick<CheatingDetectorOptions, 'fps' | 'numFaces' | 'emitCooldownMs'>
  > & {
    confirmFrames: Required<NonNullable<CheatingDetectorOptions['confirmFrames']>>;
    onCheating?: CheatingListener;
  };

  private streaks = {
    multipleFaces: 0,
    headTurn: 0,
    gazeAway: 0,
    noFace: 0,
  };
  private lastEmitAt: Partial<Record<CheatingReason, number>> = {};

  constructor(options: CheatingDetectorOptions = {}) {
    this.options = {
      fps: options.fps ?? 2.5,
      numFaces: options.numFaces ?? 3,
      emitCooldownMs: options.emitCooldownMs ?? 4000,
      confirmFrames: {
        multipleFaces: options.confirmFrames?.multipleFaces ?? 2,
        headTurn: options.confirmFrames?.headTurn ?? 4,
        gazeAway: options.confirmFrames?.gazeAway ?? 5,
        noFace: options.confirmFrames?.noFace ?? 6,
      },
      onCheating: options.onCheating,
    };
  }

  async init(): Promise<void> {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    const common = {
      runningMode: 'VIDEO' as const,
      numFaces: this.options.numFaces,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        ...common,
      });
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        ...common,
      });
    }
  }

  start(video: HTMLVideoElement): void {
    this.video = video;
    if (this.timer) return;
    const intervalMs = Math.max(200, Math.round(1000 / this.options.fps));
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
    this.video = null;
  }

  private maybeEmit(reason: CheatingReason, message: string, metrics?: Record<string, number>) {
    const now = Date.now();
    const last = this.lastEmitAt[reason] ?? 0;
    if (now - last < this.options.emitCooldownMs) return;
    this.lastEmitAt[reason] = now;
    emitCheating(
      { flag: true, reason, message, metrics, timestamp: now },
      this.options.onCheating
    );
  }

  private async tick() {
    if (this.disposed || !this.landmarker || !this.video) return;
    const video = this.video;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    let timestamp = performance.now();
    if (timestamp <= this.lastTimestamp) {
      timestamp = this.lastTimestamp + 1;
    }
    this.lastTimestamp = timestamp;

    let result: FaceLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, timestamp);
    } catch {
      return;
    }

    this.analyze(result);
  }

  private analyze(result: FaceLandmarkerResult) {
    const faces = result.faceLandmarks?.length ?? 0;
    const { confirmFrames } = this.options;

    // --- Multiple faces (instant high-confidence signal after brief confirm) ---
    if (faces >= 2) {
      this.streaks.multipleFaces += 1;
      this.streaks.noFace = 0;
      if (this.streaks.multipleFaces >= confirmFrames.multipleFaces) {
        this.maybeEmit('multiple_faces', `Detected ${faces} faces in frame`, {
          faces,
        });
      }
      // Still analyze primary face for other signals when multiple are present
    } else {
      this.streaks.multipleFaces = 0;
    }

    if (faces === 0) {
      this.streaks.noFace += 1;
      this.streaks.headTurn = 0;
      this.streaks.gazeAway = 0;
      if (this.streaks.noFace >= confirmFrames.noFace) {
        this.maybeEmit('no_face', 'No face visible for a sustained period');
      }
      return;
    }
    this.streaks.noFace = 0;

    // Primary (largest / first) face
    const landmarks = result.faceLandmarks[0];
    const matrix = result.facialTransformationMatrixes?.[0];

    // --- Head pose ---
    let headAway = false;
    let yaw = 0;
    let pitch = 0;
    if (matrix) {
      ({ yaw, pitch } = extractEuler(matrix));
      headAway =
        Math.abs(yaw) >= HEAD_YAW_THRESHOLD_DEG || Math.abs(pitch) >= HEAD_PITCH_THRESHOLD_DEG;
    }

    if (headAway) {
      this.streaks.headTurn += 1;
      if (this.streaks.headTurn >= confirmFrames.headTurn) {
        this.maybeEmit(
          'head_turn',
          `Sustained head turn away from camera (yaw=${yaw.toFixed(1)}°, pitch=${pitch.toFixed(1)}°)`,
          { yaw, pitch }
        );
      }
    } else {
      this.streaks.headTurn = 0;
    }

    // --- Gaze (skip during blink / closed eyes / fatigue) ---
    const blinkL = blendshapeScore(result, 0, 'eyeBlinkLeft');
    const blinkR = blendshapeScore(result, 0, 'eyeBlinkRight');
    const openL = eyeOpenness(
      landmarks,
      LEFT_EYE_TOP,
      LEFT_EYE_BOTTOM,
      LEFT_EYE_OUTER,
      LEFT_EYE_INNER
    );
    const openR = eyeOpenness(
      landmarks,
      RIGHT_EYE_TOP,
      RIGHT_EYE_BOTTOM,
      RIGHT_EYE_OUTER,
      RIGHT_EYE_INNER
    );

    const blinking =
      blinkL >= BLINK_BLENDSHAPE_THRESHOLD ||
      blinkR >= BLINK_BLENDSHAPE_THRESHOLD ||
      openL < EYE_OPENNESS_MIN ||
      openR < EYE_OPENNESS_MIN;

    if (blinking) {
      // Natural blink / eye fatigue — do not accumulate gaze-away streak
      this.streaks.gazeAway = 0;
      return;
    }

    const left = irisOffset(
      landmarks,
      LEFT_IRIS,
      LEFT_EYE_OUTER,
      LEFT_EYE_INNER,
      LEFT_EYE_TOP,
      LEFT_EYE_BOTTOM
    );
    const right = irisOffset(
      landmarks,
      RIGHT_IRIS,
      RIGHT_EYE_OUTER,
      RIGHT_EYE_INNER,
      RIGHT_EYE_TOP,
      RIGHT_EYE_BOTTOM
    );

    if (!left || !right) {
      this.streaks.gazeAway = 0;
      return;
    }

    const h = (Math.abs(left.h) + Math.abs(right.h)) / 2;
    const v = (Math.abs(left.v) + Math.abs(right.v)) / 2;

    // Extreme gaze only — moderate horizontal offsets from reading long lines are allowed
    const gazeAway = h >= GAZE_HORIZONTAL_THRESHOLD || v >= GAZE_VERTICAL_THRESHOLD;

    if (gazeAway) {
      this.streaks.gazeAway += 1;
      if (this.streaks.gazeAway >= confirmFrames.gazeAway) {
        this.maybeEmit(
          'gaze_away',
          `Sustained gaze away from screen center (h=${h.toFixed(2)}, v=${v.toFixed(2)})`,
          { gazeH: h, gazeV: v, yaw, pitch }
        );
      }
    } else {
      this.streaks.gazeAway = 0;
    }
  }
}
