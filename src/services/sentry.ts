import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

const SENTRY_DSN = 'https://66359f1112a5485588051b93b48950cf@o4510866506842112.ingest.us.sentry.io/4510866512871424';

export function initSentry() {
  if (__DEV__) {
    console.log('Sentry disabled in development mode');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
      }
      return event;
    },
  });

  Sentry.setContext('device', {
    brand: Device.brand,
    modelName: Device.modelName,
    osName: Device.osName,
    osVersion: Device.osVersion,
  });

  Sentry.setContext('app', {
    version: Constants.expoConfig?.version || 'unknown',
    buildNumber:
      Constants.expoConfig?.ios?.buildNumber ||
      (Constants.expoConfig?.android as any)?.versionCode ||
      'unknown',
  });
}

export function setUserContext(userId: string, email?: string, roles?: string[]) {
  Sentry.setUser({
    id: userId,
    email: email,
  });
  if (roles) {
    Sentry.setTag('user_roles', roles.join(','));
  }
}

export function clearUserContext() {
  Sentry.setUser(null);
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (__DEV__) {
    console.error('Sentry would capture:', error, context);
    return;
  }

  if (context) {
    Sentry.setContext('additional', context);
  }
  Sentry.captureException(error);
}

export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info'
) {
  if (__DEV__) {
    console.log(`Sentry [${level}]:`, message);
    return;
  }

  Sentry.captureMessage(message, level);
}

export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

