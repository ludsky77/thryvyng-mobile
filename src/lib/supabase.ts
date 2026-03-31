import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://xkabjcxlohseuxlrwdkw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrYWJqY3hsb2hzZXV4bHJ3ZGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzcwMTgsImV4cCI6MjA5MDQ1MzAxOH0.IE4JNUr_ciLGyGVGZMHZWc76rpxEaxqoxsI5fC8bbaE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});