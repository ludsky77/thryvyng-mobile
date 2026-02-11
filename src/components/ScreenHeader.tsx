import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NotificationBell } from './NotificationBell';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  showBell?: boolean;
  rightComponent?: React.ReactNode;
}

export function ScreenHeader({
  title,
  showBack = false,
  showBell = true,
  rightComponent,
}: ScreenHeaderProps) {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.header}>
      {showBack ? (
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.rightSection}>
        {rightComponent}
        {showBell && <NotificationBell />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#1e293b',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: 40,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 40,
    justifyContent: 'flex-end',
  },
});
