import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';

export type AttachmentKind = 'image' | 'video' | 'document';

export interface AttachmentTarget {
  url: string;
  type: AttachmentKind;
  name?: string;
}

interface AttachmentViewerProps {
  visible: boolean;
  attachment: AttachmentTarget | null;
  onClose: () => void;
}

/**
 * Full-screen viewer for a single chat attachment.
 *
 * Images render inside a zoomable ScrollView (pinch on iOS, double-tap-free
 * pan on both). Video uses expo-av's <Video useNativeControls>. Documents are
 * handed to the OS via Linking rather than rendered here.
 */
export function AttachmentViewer({
  visible,
  attachment,
  onClose,
}: AttachmentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  if (!attachment) return null;
  const { url, type, name } = attachment;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {name || 'Attachment'}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {failed ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={40} color="#9CA3AF" />
            <Text style={styles.errorText}>Could not load this attachment.</Text>
          </View>
        ) : type === 'image' ? (
          <ScrollView
            style={styles.zoomArea}
            contentContainerStyle={styles.zoomContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
          >
            <Image
              source={{ uri: url }}
              style={styles.image}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
          </ScrollView>
        ) : type === 'video' ? (
          <View style={styles.zoomArea}>
            <Video
              source={{ uri: url }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
          </View>
        ) : (
          <View style={styles.center}>
            <Feather name="file-text" size={48} color="#8B5CF6" />
            <Text style={styles.docName} numberOfLines={2}>
              {name || 'Document'}
            </Text>
            <TouchableOpacity
              style={styles.openButton}
              onPress={() => openExternally(url)}
            >
              <Feather name="external-link" size={18} color="#FFFFFF" />
              <Text style={styles.openButtonText}>Open</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && type !== 'document' && !failed && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#8B5CF6" />
          </View>
        )}
      </View>
    </Modal>
  );
}

/** Hand a URL to the OS. Documents never render inside the app. */
export async function openExternally(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Cannot open', 'No app on this device can open this file.');
      return;
    }
    await Linking.openURL(url);
  } catch (err) {
    if (__DEV__) console.error('[AttachmentViewer] openURL failed', err);
    Alert.alert('Cannot open', 'Something went wrong opening this file.');
  }
}

/**
 * Convenience state holder. `open` shows the viewer for images and video and
 * hands documents straight to the OS, so callers do not branch themselves.
 */
export function useAttachmentViewer() {
  const [target, setTarget] = useState<AttachmentTarget | null>(null);

  const open = useCallback((next: AttachmentTarget) => {
    if (next.type === 'document') {
      openExternally(next.url);
      return;
    }
    setTarget(next);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  return { target, open, close, visible: target !== null };
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    gap: 16,
  },
  title: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  zoomArea: { flex: 1 },
  zoomContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  image: { width, height: height * 0.75 },
  video: { flex: 1, width: '100%' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  errorText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center' },
  docName: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  openButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
