export interface LiveCoordinates {
  lat: number;
  lng: number;
}

const getPosition = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

export const getLiveCoordinates = async (): Promise<LiveCoordinates> => {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported on this device or browser.');
  }

  try {
    const position = await getPosition({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (error) {
    const geoError = error as GeolocationPositionError;
    if (geoError.code === geoError.PERMISSION_DENIED) {
      throw error;
    }

    const position = await getPosition({
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 60000,
    });
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  }
};

export const getGeolocationErrorMessage = (error: unknown) => {
  const geoError = error as GeolocationPositionError;

  if (!window.isSecureContext) {
    return `Live location is blocked on ${window.location.origin}. Open the local app at http://localhost:5173 or http://127.0.0.1:5173.`;
  }

  if (geoError?.code === geoError.PERMISSION_DENIED) {
    return 'The browser denied location access. Allow location permission for this site, refresh, and try again.';
  }

  if (geoError?.code === geoError.POSITION_UNAVAILABLE) {
    return 'Your device could not determine its location. Turn on GPS or location services, then try again.';
  }

  if (geoError?.code === geoError.TIMEOUT) {
    return 'Location lookup timed out. Move near a window or try again with location services enabled.';
  }

  return error instanceof Error ? error.message : 'Unable to fetch your live location.';
};
