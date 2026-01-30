import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { supabase } from './src/lib/supabase';

export default function App() {
  const [clubCount, setClubCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        const { count, error } = await supabase
          .from('clubs')
          .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        setClubCount(count);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    testConnection();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎉 Thryvyng Mobile</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#8b5cf6" />
      ) : error ? (
        <Text style={styles.error}>Error: {error}</Text>
      ) : (
        <Text style={styles.success}>
          ✅ Connected to Supabase!{'\n'}
          Found {clubCount} clubs in database
        </Text>
      )}
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 30,
  },
  success: {
    fontSize: 18,
    color: '#10b981',
    textAlign: 'center',
    lineHeight: 28,
  },
  error: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
});