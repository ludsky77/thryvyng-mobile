import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Share,
  Linking,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface AwardType {
  award_name: string;
  award_tagline: string | null;
  award_color: string | null;
}

interface CertificateData {
  id: string;
  generated_certificate_url: string | null;
  player_name: string | null;
  award_id?: string | null;
  award_types?: AwardType | AwardType[] | null;
}

export default function CertificateViewerScreen({ route, navigation }: any) {
  const { evaluation_id } = route.params;
  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    fetchCertificate();
  }, [evaluation_id]);

  const fetchCertificate = async () => {
    if (!evaluation_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: evalData, error } = await supabase
        .from('player_evaluations')
        .select('*')
        .eq('id', evaluation_id)
        .single();

      if (error) throw error;

      let award: AwardType | null = null;
      const row = evalData as any;
      if (row?.award_id) {
        const { data: awardData } = await supabase
          .from('award_types')
          .select('award_name, award_tagline, award_color')
          .eq('id', row.award_id)
          .maybeSingle();
        if (awardData) award = awardData;
      }
      const awardRel = row?.award_types ?? row?.award_type;
      if (!award && awardRel) {
        award = Array.isArray(awardRel) ? awardRel[0] : awardRel;
      }
      setData({ ...row, award_types: award } as CertificateData);
    } catch (err) {
      console.error('Error fetching certificate:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    const url = data?.generated_certificate_url;
    if (!url) return;

    try {
      await Share.share({
        message: `Certificate for ${data?.player_name || 'Player'}: ${url}`,
        url,
        title: 'Evaluation Certificate',
      });
    } catch (err: any) {
      if (err.message !== 'User did not share') {
        Alert.alert('Error', 'Could not share certificate');
      }
    }
  };

  const handleDownload = () => {
    const url = data?.generated_certificate_url;
    if (!url) return;
    Linking.openURL(url);
  };

  const award =
    data?.award_types &&
    (Array.isArray(data.award_types) ? data.award_types[0] : data.award_types);
  const awardColor = award?.award_color || '#8b5cf6';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading certificate...</Text>
      </View>
    );
  }

  if (!data?.generated_certificate_url) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>📜</Text>
        <Text style={styles.errorTitle}>No Certificate</Text>
        <Text style={styles.errorText}>
          This evaluation does not have a generated certificate yet.
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {award && (
        <View style={[styles.awardHeader, { borderLeftColor: awardColor }]}>
          <Text style={[styles.awardName, { color: awardColor }]}>
            {award.award_name}
          </Text>
          {award.award_tagline && (
            <Text style={styles.awardTagline}>{award.award_tagline}</Text>
          )}
        </View>
      )}

      {data.player_name && (
        <Text style={styles.playerName}>{data.player_name}</Text>
      )}

      <View style={styles.imageContainer}>
        {imageLoading && (
          <View style={styles.imageLoadingOverlay}>
            <ActivityIndicator size="large" color="#8b5cf6" />
          </View>
        )}
        <Image
          source={{ uri: data.generated_certificate_url }}
          style={styles.certificateImage}
          resizeMode="contain"
          onLoadStart={() => setImageLoading(true)}
          onLoadEnd={() => setImageLoading(false)}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
        >
          <Text style={styles.actionButtonText}>📤 Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.downloadButton}
          onPress={handleDownload}
        >
          <Text style={styles.actionButtonText}>⬇️ Download</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  awardHeader: {
    backgroundColor: '#2a2a4e',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderRadius: 8,
  },
  awardName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  awardTagline: {
    color: '#aaa',
    fontSize: 14,
  },
  playerName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  imageContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
    minHeight: 300,
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a4e',
  },
  certificateImage: {
    width: '100%',
    aspectRatio: 0.75,
    minHeight: 300,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  downloadButton: {
    flex: 1,
    backgroundColor: '#3a3a6e',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
