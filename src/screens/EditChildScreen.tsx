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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const AVATAR_BUCKET = 'avatars';

function normalizeEmail(e: string | null | undefined): string {
  return (e || '').trim().toLowerCase();
}

function formatDobDisplay(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function parseIsoToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const dayPart = iso.split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayPart);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) return dt;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToIsoDate(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function EditChildScreen({ navigation }: { navigation: any }) {
  const route = useRoute<any>();
  const playerId = route.params?.playerId as string | undefined;
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [dobPickerVisible, setDobPickerVisible] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFileUri, setPhotoFileUri] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      Alert.alert('Access denied', 'You cannot edit this player.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      return;
    }

    let cancelled = false;

    const deny = () => {
      if (cancelled) return;
      setLoading(false);
      Alert.alert('Access denied', 'You cannot edit this player.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    };

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('players').select('*').eq('id', playerId).single();

      if (cancelled) return;

      if (error || !data) {
        deny();
        return;
      }

      const pe = normalizeEmail(data.parent_email);
      const ue = normalizeEmail(user?.email);
      const pr = normalizeEmail(profile?.email);
      if (!pe || (pe !== ue && pe !== pr)) {
        deny();
        return;
      }

      setFirstName(data.first_name ?? '');
      setLastName(data.last_name ?? '');
      setDobDate(parseIsoToDate(data.date_of_birth) ?? new Date(2010, 0, 1));
      setPhotoUrl(data.photo_url ?? null);
      setPhotoFileUri(null);
      setPhotoRemoved(false);
      setEmergencyName(data.emergency_contact_name ?? '');
      setEmergencyPhone(data.emergency_contact_phone ?? '');
      setEmergencyRelation(data.emergency_contact_relation ?? '');
      setAllergies(data.allergies ?? '');
      setMedicalNotes(data.medical_notes ?? '');
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [playerId, user?.email, profile?.email, navigation]);

  const showChangePhotoOptions = () => {
    Alert.alert('Change Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: () => void handleTakePhoto() },
      { text: 'Choose from Library', onPress: () => void handleChooseFromLibrary() },
      { text: 'Remove Photo', onPress: handleRemovePhoto, style: 'destructive' },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow camera access in Settings to take photos.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setPhotoFileUri(result.assets[0].uri);
      setPhotoRemoved(false);
    }
  };

  const handleChooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow photo access in Settings to choose images.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setPhotoFileUri(result.assets[0].uri);
      setPhotoRemoved(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFileUri(null);
    setPhotoUrl(null);
    setPhotoRemoved(true);
  };

  const uploadPlayerPhoto = async (): Promise<string | null> => {
    if (!playerId) return null;
    if (photoRemoved) return null;
    if (!photoFileUri) return photoUrl;

    setPhotoUploading(true);
    try {
      const response = await fetch(photoFileUri);
      const blob = await response.blob();
      const filePath = `players/${playerId}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      return urlData.publicUrl;
    } finally {
      setPhotoUploading(false);
    }
  };

  const onDobPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setDobPickerVisible(false);
    }
    if (event.type === 'dismissed') {
      if (Platform.OS === 'ios') setDobPickerVisible(false);
      return;
    }
    if (date) {
      setDobDate(date);
      if (Platform.OS === 'ios') setDobPickerVisible(false);
    }
  };

  const handleSave = async () => {
    setSubmitError('');
    const tf = firstName.trim();
    const tl = lastName.trim();
    if (!tf) {
      Alert.alert('Validation', 'First name is required.');
      return;
    }
    if (!tl) {
      Alert.alert('Validation', 'Last name is required.');
      return;
    }
    if (!playerId) return;

    setSaving(true);
    try {
      let newPhotoUrl: string | null = photoUrl;
      if (photoRemoved) {
        newPhotoUrl = null;
      } else if (photoFileUri) {
        newPhotoUrl = await uploadPlayerPhoto();
      }

      const { error } = await supabase
        .from('players')
        .update({
          first_name: tf,
          last_name: tl,
          date_of_birth: dateToIsoDate(dobDate),
          photo_url: newPhotoUrl,
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null,
          emergency_contact_relation: emergencyRelation.trim() || null,
          allergies: allergies.trim() || null,
          medical_notes: medicalNotes.trim() || null,
        })
        .eq('id', playerId);

      if (error) {
        setSubmitError(error.message || 'Failed to save.');
        return;
      }

      Alert.alert('Player updated', '', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const displayPhotoUri = photoFileUri ?? (photoRemoved ? null : photoUrl);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Player</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Player</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.cardTitle}>Player info</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.avatarTap}
            onPress={showChangePhotoOptions}
            disabled={photoUploading}
            activeOpacity={0.8}
          >
            {photoUploading ? (
              <View style={[styles.avatar, styles.avatarLoading]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : displayPhotoUri ? (
              <Image source={{ uri: displayPhotoUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>{(firstName || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.changePhotoHint}>Tap to change photo</Text>
          </TouchableOpacity>

          <Text style={styles.label}>First name</Text>
          <TextInput
            style={[styles.input, focusedKey === 'fn' && styles.inputFocused]}
            value={firstName}
            onChangeText={setFirstName}
            onFocus={() => setFocusedKey('fn')}
            onBlur={() => setFocusedKey(null)}
            placeholder="First name"
            placeholderTextColor="#64748b"
            autoCapitalize="words"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Last name</Text>
          <TextInput
            style={[styles.input, focusedKey === 'ln' && styles.inputFocused]}
            value={lastName}
            onChangeText={setLastName}
            onFocus={() => setFocusedKey('ln')}
            onBlur={() => setFocusedKey(null)}
            placeholder="Last name"
            placeholderTextColor="#64748b"
            autoCapitalize="words"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Date of birth</Text>
          <TouchableOpacity
            style={[styles.input, styles.dobTouchable, focusedKey === 'dob' && styles.inputFocused]}
            onPress={() => setDobPickerVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.dobText}>{formatDobDisplay(dobDate) || 'Select date'}</Text>
            <Feather name="calendar" size={18} color="#94a3b8" />
          </TouchableOpacity>
          {dobPickerVisible ? (
            <DateTimePicker
              value={dobDate ?? new Date(2010, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onDobPickerChange}
              maximumDate={new Date()}
            />
          ) : null}
          {Platform.OS === 'ios' && dobPickerVisible ? (
            <TouchableOpacity style={styles.dobDone} onPress={() => setDobPickerVisible(false)}>
              <Text style={styles.dobDoneText}>Done</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.cardTitle}>Emergency contact</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={[styles.input, focusedKey === 'en' && styles.inputFocused]}
            value={emergencyName}
            onChangeText={setEmergencyName}
            onFocus={() => setFocusedKey('en')}
            onBlur={() => setFocusedKey(null)}
            placeholder="Contact name"
            placeholderTextColor="#64748b"
          />
          <Text style={[styles.label, styles.labelSpaced]}>Phone</Text>
          <TextInput
            style={[styles.input, focusedKey === 'ep' && styles.inputFocused]}
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            onFocus={() => setFocusedKey('ep')}
            onBlur={() => setFocusedKey(null)}
            placeholder="Phone number"
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
          />
          <Text style={[styles.label, styles.labelSpaced]}>Relation</Text>
          <TextInput
            style={[styles.input, focusedKey === 'er' && styles.inputFocused]}
            value={emergencyRelation}
            onChangeText={setEmergencyRelation}
            onFocus={() => setFocusedKey('er')}
            onBlur={() => setFocusedKey(null)}
            placeholder="e.g. Grandmother"
            placeholderTextColor="#64748b"
          />
        </View>

        <Text style={styles.cardTitle}>Medical info</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Allergies</Text>
          <TextInput
            style={[styles.input, styles.multiline, focusedKey === 'al' && styles.inputFocused]}
            value={allergies}
            onChangeText={setAllergies}
            onFocus={() => setFocusedKey('al')}
            onBlur={() => setFocusedKey(null)}
            placeholder="List any allergies"
            placeholderTextColor="#64748b"
            multiline
          />
          <Text style={[styles.label, styles.labelSpaced]}>Medical notes</Text>
          <TextInput
            style={[styles.input, styles.multiline, focusedKey === 'mn' && styles.inputFocused]}
            value={medicalNotes}
            onChangeText={setMedicalNotes}
            onFocus={() => setFocusedKey('mn')}
            onBlur={() => setFocusedKey(null)}
            placeholder="Other medical information"
            placeholderTextColor="#64748b"
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={() => void handleSave()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0a0a1a',
  },
  headerButton: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  headerSpacer: { width: 32 },
  scroll: { flex: 1, backgroundColor: '#0a0a1a' },
  scrollContent: { padding: 16, paddingBottom: 40, backgroundColor: '#0a0a1a' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0a0a1a',
  },
  cardTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#2a2a4e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  avatarTap: { alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarLoading: {
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 40, fontWeight: '700', color: '#fff' },
  changePhotoHint: { color: '#8b5cf6', fontSize: 13, fontWeight: '600', marginTop: 8 },
  label: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  labelSpaced: { marginTop: 12 },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  inputFocused: { borderColor: '#8b5cf6' },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  dobTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dobText: { color: '#fff', fontSize: 16 },
  dobDone: { alignSelf: 'flex-end', marginTop: 8 },
  dobDoneText: { color: '#8b5cf6', fontSize: 16, fontWeight: '600' },
  saveButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.75 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitError: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  bottomPad: { height: 24 },
});
