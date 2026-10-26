import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

/**
 * A transient in-app toast for the chat screens.
 *
 * Ruling R10 (Lu, 2026-10-25): "replace the iOS Alert 'Copied / Message copied
 * to clipboard' with an in-app toast 'Copied' (~1.5 s). If a toast component
 * already exists in the app, reuse it; do not add a dependency."
 *
 * THERE WAS NOTHING TO REUSE. `grep -rln "Toast|toast|Snackbar" src` finds four
 * files and every one of them is a PRIVATE copy inside a screen --
 * `ProductDetailScreen.tsx:193-197` (`showAddedToast` + a 2000 ms setTimeout),
 * `WorldCupPredictorScreen.tsx:445-447` (`showToast` + 2500 ms),
 * `PendingAttachmentsBanner.tsx:147-151` (`resultMessage`), and
 * `EventDetailScreen.tsx:1101`, which is a comment about clearing a confirmation
 * "so it reads as a transient toast". No shared component, no provider, nothing
 * exported. So this is the fifth hand-rolled one -- and it is deliberately
 * scoped to `components/chat/`, because promoting it app-wide means touching
 * those three screens and this task's SCOPE is chat only. That promotion is in
 * the report's RECOMMEND.
 *
 * No dependency: `Animated` from react-native core, the same thing the rest of
 * this folder uses.
 *
 * WHY THE HOOK AND THE VIEW ARE SPLIT. The Copy action lives inside the actions
 * sheet, which is an RN `Modal` -- a toast rendered in there dies the instant the
 * sheet closes, which is the same instant the copy happens. So the screen owns
 * the state and renders the toast ABOVE the thread, and the sheet only reports
 * that it copied.
 */

/** R10's duration. */
const TOAST_MS = 1500;
const FADE_MS = 180;

/**
 * Toast state for one screen. `show(message)` replaces whatever is up, so two
 * quick copies read as one toast that stays rather than a flicker.
 */
export function useChatToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(next);
    timerRef.current = setTimeout(() => setMessage(null), TOAST_MS);
  }, []);

  // A screen left while a toast is up must not come back to a pending timer.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { message, show };
}

interface ChatToastProps {
  /** The text, or null for nothing shown. */
  message: string | null;
}

export function ChatToast({ message }: ChatToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  // Kept so the text does not vanish before the fade-out finishes.
  const [rendered, setRendered] = useState<string | null>(message);

  useEffect(() => {
    if (message) {
      setRendered(message);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRendered(null);
    });
  }, [message, opacity]);

  if (!rendered) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.toastText}>{rendered}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Centred over the thread, clear of the composer. pointerEvents none on the
  // view above: a toast is never a target.
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderWidth: 1,
    borderColor: '#374151',
  },
  toastText: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '600',
  },
});
