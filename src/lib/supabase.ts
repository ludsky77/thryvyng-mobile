import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://jgivhzemwidvyykruldq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaXZoemVtd2lkdnl5a3J1bGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAwMzAsImV4cCI6MjA3ODAyNjAzMH0.TXANIO17IRzrdoAA1Loq0kXUoTUlsWYcu49EquRc4G8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});