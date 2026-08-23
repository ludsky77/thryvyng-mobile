import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { registerCaptchaHost, type CaptchaFailureReason } from '../lib/captcha';

/**
 * Cloudflare Turnstile site key. This is a public value (it ships in the
 * client of every Turnstile integration) — the secret key lives server-side.
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAEPoaPou1cEDlF2C';

/**
 * Turnstile validates the challenge against the origin that served the page.
 * An inline-HTML WebView has no origin of its own, so we pin one that is on
 * the site key's allowed-domains list.
 */
const CAPTCHA_BASE_URL = 'https://thryvyng.com';

const TURNSTILE_API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/** Message shapes posted back from the WebView. */
export type CaptchaMessage =
  | { type: 'token'; token: string }
  | { type: 'error'; code?: string }
  | { type: 'expired' };

export interface CaptchaModalProps {
  visible: boolean;
  /** Fired once with a fresh Turnstile token. */
  onToken: (token: string) => void;
  /** Fired when the widget errors out or its token expires before we read it. */
  onError: (reason: string) => void;
  /** Fired when the user dismisses the sheet. */
  onCancel: () => void;
}

/**
 * Builds the self-contained Turnstile page. Exported so any surface that needs
 * to host the widget itself can reuse the exact markup the root host uses.
 */
export function buildTurnstileHtml(siteKey: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: #1F2937;
        -webkit-user-select: none;
        user-select: none;
      }
      #wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="wrap">
      <div
        class="cf-turnstile"
        data-sitekey="${siteKey}"
        data-theme="dark"
        data-callback="onTurnstileSuccess"
        data-error-callback="onTurnstileError"
        data-expired-callback="onTurnstileExpired"
      ></div>
    </div>
    <script>
      // Defined before api.js loads so the widget can find the callbacks by name.
      function postToNative(message) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      }
      function onTurnstileSuccess(token) {
        postToNative({ type: 'token', token: token });
      }
      function onTurnstileError(code) {
        postToNative({ type: 'error', code: String(code == null ? '' : code) });
      }
      function onTurnstileExpired() {
        postToNative({ type: 'expired' });
      }
      window.onerror = function (message) {
        postToNative({ type: 'error', code: 'script: ' + message });
        return true;
      };
    </script>
    <script src="${TURNSTILE_API_URL}" async defer></script>
  </body>
</html>`;
}

export interface CaptchaWebViewProps {
  /** Mount the WebView. Flip to false to tear the widget down between uses. */
  active: boolean;
  /** Fired once with a fresh Turnstile token. */
  onToken: (token: string) => void;
  /** Fired when the widget errors out or its token expires before we read it. */
  onError: (reason: string) => void;
  /** When provided, renders the standard Cancel affordance under the widget. */
  onCancel?: () => void;
}

/**
 * The Turnstile widget itself: WebView, loading state, and message parsing,
 * with NO <Modal> of its own.
 *
 * iOS presents one Modal at a time, so a surface that already owns a Modal
 * (e.g. IdentityVerificationModal) cannot rely on the root CaptchaHost — its
 * sheet never appears and the request just times out. Such a surface embeds
 * this component inline instead. {@link CaptchaModal} wraps it for the root
 * host case.
 */
export const CaptchaWebView: React.FC<CaptchaWebViewProps> = ({
  active,
  onToken,
  onError,
  onCancel,
}) => {
  const html = useMemo(() => buildTurnstileHtml(TURNSTILE_SITE_KEY), []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: CaptchaMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as CaptchaMessage;
      } catch {
        onError('Unreadable response from the verification widget.');
        return;
      }

      if (message.type === 'token' && message.token) {
        onToken(message.token);
        return;
      }
      if (message.type === 'expired') {
        onError('Verification expired before it could be used.');
        return;
      }
      onError(message.type === 'error' && message.code ? message.code : 'Verification failed.');
    },
    [onToken, onError]
  );

  return (
    <>
      <View style={styles.webViewFrame}>
        {active && (
          <WebView
            source={{ html, baseUrl: CAPTCHA_BASE_URL }}
            onMessage={handleMessage}
            onError={() => onError('Could not load the verification widget.')}
            onHttpError={() => onError('Could not load the verification widget.')}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            setSupportMultipleWindows={false}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color="#8B5CF6" />
              </View>
            )}
            style={styles.webView}
            containerStyle={styles.webViewContainer}
          />
        )}
      </View>

      {onCancel && (
        <TouchableOpacity onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </>
  );
};

export const CaptchaModal: React.FC<CaptchaModalProps> = ({
  visible,
  onToken,
  onError,
  onCancel,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel verification"
            >
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={40} color="#8B5CF6" />
          </View>

          <Text style={styles.title}>Quick security check</Text>
          <Text style={styles.subtitle}>
            Confirm you&apos;re human to continue. This usually takes a second.
          </Text>

          <CaptchaWebView
            active={visible}
            onToken={onToken}
            onError={onError}
            onCancel={onCancel}
          />
        </View>
      </View>
    </Modal>
  );
};

/**
 * Mount once at the App root. Owns the modal state and registers itself as the
 * target for `getCaptchaToken()` in `src/lib/captcha.ts`.
 */
export const CaptchaHost: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const settleRef = useRef<
    ((token: string | null, reason?: CaptchaFailureReason) => void) | null
  >(null);

  useEffect(
    () =>
      registerCaptchaHost({
        open: (settle) => {
          settleRef.current = settle;
          setVisible(true);
        },
        close: () => {
          settleRef.current = null;
          setVisible(false);
        },
      }),
    []
  );

  // Detach the settler before invoking it so the host's own close() is a no-op
  // rather than a re-entrant settle.
  const finish = useCallback((token: string | null, reason?: CaptchaFailureReason) => {
    const settle = settleRef.current;
    settleRef.current = null;
    setVisible(false);
    settle?.(token, reason);
  }, []);

  const handleToken = useCallback((token: string) => finish(token), [finish]);

  const handleError = useCallback(
    (reason: string) => {
      if (__DEV__) console.warn('[captcha] Widget error:', reason);
      finish(null, 'error');
    },
    [finish]
  );

  const handleCancel = useCallback(() => finish(null, 'cancel'), [finish]);

  return (
    <CaptchaModal
      visible={visible}
      onToken={handleToken}
      onError={handleError}
      onCancel={handleCancel}
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  closeButton: {
    padding: 4,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  webViewFrame: {
    height: 110,
    justifyContent: 'center',
    marginBottom: 16,
  },
  webViewContainer: {
    backgroundColor: 'transparent',
  },
  webView: {
    backgroundColor: 'transparent',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#9CA3AF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
});

export default CaptchaModal;
