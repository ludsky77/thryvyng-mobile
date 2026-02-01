import { Linking, Platform } from 'react-native';

export const openInMaps = async (address: string, locationName?: string) => {
  const query = encodeURIComponent(address || locationName || '');

  if (!query) return;

  // Try Google Maps first, fall back to Apple Maps on iOS or browser
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  const appleMapsUrl = `http://maps.apple.com/?q=${query}`;

  if (Platform.OS === 'ios') {
    // Try Google Maps app, fall back to Apple Maps
    const googleMapsAppUrl = `comgooglemaps://?q=${query}`;
    const canOpenGoogle = await Linking.canOpenURL(googleMapsAppUrl);

    if (canOpenGoogle) {
      await Linking.openURL(googleMapsAppUrl);
    } else {
      await Linking.openURL(appleMapsUrl);
    }
  } else {
    // Android - Google Maps
    const googleMapsAppUrl = `geo:0,0?q=${query}`;
    const canOpenGeo = await Linking.canOpenURL(googleMapsAppUrl);

    if (canOpenGeo) {
      await Linking.openURL(googleMapsAppUrl);
    } else {
      await Linking.openURL(googleMapsUrl);
    }
  }
};
