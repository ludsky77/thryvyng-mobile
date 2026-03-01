import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const AVATAR_BUCKET = 'avatars';

export default function EditProfileScreen({ navigation }: any) {
  const { user, profile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [avatarFileUri, setAvatarFileUri] = useState<string | null>(null); // Local URI for new pick
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setEmail(user?.email ?? '');
    setPhone(profile?.phone ?? '');
    setAvatarUri(profile?.avatar_url ?? null);
  }, [profile?.full_name, profile?.phone, profile?.avatar_url, user?.email]);

  const showChangePhotoOptions = () => {
    Alert.alert('Change Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: handleTakePhoto },
      { text: 'Choose from Library', onPress: handleChooseFromLibrary },
      { text: 'Remove Photo', onPress: handleRemovePhoto, style: 'destructive' },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow camera access in Settings to take photos.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setAvatarFileUri(result.assets[0].uri);
      setAvatarRemoved(false);
    }
  };

  const handleChooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow photo access in Settings to choose images.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setAvatarFileUri(result.assets[0].uri);
      setAvatarRemoved(false);
    }
  };

  const handleRemovePhoto = () => {
    setAvatarFileUri(null);
    setAvatarUri(null);
    setAvatarRemoved(true);
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!user?.id) return null;
    if (avatarRemoved) return null;
    if (!avatarFileUri) return avatarUri; // Keep existing if no new pick

    setAvatarUploading(true);
    try {
      const response = await fetch(avatarFileUri);
      const blob = await response.blob();
      const filePath = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('[EditProfile] Avatar upload error:', uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (err) {
      console.error('[EditProfile] Avatar upload failed:', err);
      throw err;
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      Alert.alert('Validation', 'Full name is required.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Error', 'You must be signed in to update your profile.');
      return;
    }

    setSaving(true);
    try {
      let newAvatarUrl: string | null = avatarUri;

      if (avatarRemoved) {
        newAvatarUrl = null;
      } else if (avatarFileUri) {
        newAvatarUrl = await uploadAvatar();
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          phone: phone.trim() || null,
          avatar_url: newAvatarUrl,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      const emailTrimmed = email.trim();
      if (emailTrimmed && emailTrimmed !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: emailTrimmed,
        });
        if (emailError) {
          Alert.alert(
            'Email Update',
            'Profile saved. Email change requires verification—check your inbox for the verification link.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
          return;
        }
      }

      Alert.alert('Success', 'Profile updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('[EditProfile] Save error:', err);
      Alert.alert('Error', err?.message ?? 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const displayAvatarUri = avatarFileUri ?? (avatarRemoved ? null : avatarUri);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            {avatarUploading ? (
              <View style={[styles.avatarPlaceholder, styles.avatarLoading]}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : displayAvatarUri ? (
              <Image source={{ uri: displayAvatarUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {(fullName || profile?.full_name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.changePhotoButton}
            onPress={showChangePhotoOptions}
            disabled={avatarUploading}
          >
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formCard}>
          <Text style={[styles.label, styles.labelFirst]}>Full Name</Text>
          <TextInput
            style={[styles.input, nameFocused && styles.inputFocused]}
            value={fullName}
            onChangeText={setFullName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="Enter your full name"
            placeholderTextColor="#64748b"
            autoCapitalize="words"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailFocused && styles.inputFocused]}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder="Enter your email"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>Changing email requires verification</Text>

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={[styles.input, phoneFocused && styles.inputFocused]}
            value={phone}
            onChangeText={setPhone}
            onFocus={() => setPhoneFocused(true)}
            onBlur={() => setPhoneFocused(false)}
            placeholder="(123) 456-7890"
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Text style={styles.saveButtonText}>Saving...</Text>
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLoading: {
    opacity: 0.9,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
  },
  changePhotoButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changePhotoText: {
    color: '#8b5cf6',
    fontSize: 15,
    fontWeight: '600',
  },
  formCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 12,
  },
  labelFirst: {
    marginTop: 0,
  },
  input: {
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  inputFocused: {
    borderColor: '#8b5cf6',
  },
  hint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
