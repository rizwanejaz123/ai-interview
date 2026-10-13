'use client';

import { useEffect, useRef, type RefObject } from 'react';
import {
  CheatingDetector,
  type CheatingDetectorOptions,
  type CheatingListener,
} from '@/lib/cheating-detection';

/**
 * Runs MediaPipe FaceLandmarker on a video element at low FPS.
 * Logs and emits `interview-cheating` window events on sustained signals.
 */
export function useCheatingDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  options?: CheatingDetectorOptions
) {
  const onCheatingRef = useRef<CheatingListener | undefined>(options?.onCheating);
  onCheatingRef.current = options?.onCheating;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let removeReady: (() => void) | undefined;
    const detector = new CheatingDetector({
      ...optionsRef.current,
      onCheating: (detail) => onCheatingRef.current?.(detail),
    });

    const tryStart = () => {
      const el = videoRef.current;
      if (!el || cancelled) return false;
      if (el.readyState >= 2 && el.videoWidth > 0) {
        detector.start(el);
        return true;
      }
      return false;
    };

    (async () => {
      try {
        await detector.init();
        if (cancelled) {
          detector.dispose();
          return;
        }
        if (!tryStart()) {
          const el = videoRef.current;
          const onReady = () => {
            if (tryStart()) {
              el?.removeEventListener('loadeddata', onReady);
            }
          };
          el?.addEventListener('loadeddata', onReady);
          removeReady = () => el?.removeEventListener('loadeddata', onReady);
        }
      } catch (err) {
        console.error('Cheating detector failed to init:', err);
      }
    })();

    return () => {
      cancelled = true;
      removeReady?.();
      detector.dispose();
    };
  }, [enabled, videoRef]);
}
