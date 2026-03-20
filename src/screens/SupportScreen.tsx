import React, { useEffect } from 'react';
import { View, ActivityIndicator, Linking } from 'react-native';
import { useRoute } from '@react-navigation/native';

export default function SupportScreen() {
  const route = useRoute<any>();
  const { slug, code } = route.params || {};
  const referralCode = code || slug || '';

  useEffect(() => {
    // Open the web version - the referral catalog page
    Linking.openURL(`https://thryvyng.com/support/${referralCode}`);
  }, [referralCode]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' }}>
      <ActivityIndicator size="large" color="#8B5CF6" />
    </View>
  );
}
