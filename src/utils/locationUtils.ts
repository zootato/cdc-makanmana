// Singapore postal code to coordinates mapping (sample data)
// In a production app, you'd use a proper geocoding service like OneMap API
export const postalCodeCoordinates: { [key: string]: { lat: number; lng: number } } = {
  // Central Singapore
  "018956": { lat: 1.2966, lng: 103.8520 }, // Marina Bay
  "049910": { lat: 1.2835, lng: 103.8607 }, // Raffles Place
  
  // North Singapore
  "310127": { lat: 1.3380, lng: 103.8447 }, // Toa Payoh
  "560416": { lat: 1.3645, lng: 103.8551 }, // Ang Mo Kio
  "760417": { lat: 1.4244, lng: 103.8463 }, // Yishun
  "730753": { lat: 1.4382, lng: 103.7890 }, // Woodlands
  
  // East Singapore
  "520159": { lat: 1.3496, lng: 103.9568 }, // Tampines
  "460084": { lat: 1.3318, lng: 103.9392 }, // Bedok
  "520248": { lat: 1.3436, lng: 103.9535 }, // Simei
  
  // West Singapore
  "640789": { lat: 1.3496, lng: 103.7065 }, // Jurong West
  "640505": { lat: 1.3497, lng: 103.7184 }, // Jurong West
  "120654": { lat: 1.3162, lng: 103.7649 }, // Clementi
  
  // South Singapore
  "090006": { lat: 1.2781, lng: 103.8185 }, // Telok Blangah
  "149644": { lat: 1.3069, lng: 103.8004 }, // Commonwealth
};

// Calculate distance between two coordinates using Haversine formula
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// Get coordinates for a postal code
export const getCoordinatesFromPostalCode = (postalCode: string): { lat: number; lng: number } | null => {
  // First try exact match
  if (postalCodeCoordinates[postalCode]) {
    return postalCodeCoordinates[postalCode];
  }
  
  // Try to find similar postal codes (first 3 digits match for same area)
  const area = postalCode.substring(0, 3);
  const similarPostalCodes = Object.keys(postalCodeCoordinates).filter(code => 
    code.startsWith(area)
  );
  
  if (similarPostalCodes.length > 0) {
    return postalCodeCoordinates[similarPostalCodes[0]];
  }
  
  // Fallback to Singapore center
  return { lat: 1.3521, lng: 103.8198 };
};

// Enhanced postal code geocoding using real APIs only
export const geocodePostalCode = async (postalCode: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    console.log('Geocoding postal code:', postalCode);
    
    // Try CDC's OneMap API first (most reliable for Singapore)
    try {
      const cdcUrl = `https://prd-tmp.api.gowhere.gov.sg/xgw/onemap/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
      const { fetchWithProxy } = await import('./proxyUtils');
      const data = await fetchWithProxy(cdcUrl);
      
      if (data.found > 0 && data.results.length > 0) {
        const result = data.results[0];
        const coords = {
          lat: parseFloat(result.LATITUDE),
          lng: parseFloat(result.LONGITUDE)
        };
        console.log('CDC API geocoding successful:', coords);
        return coords;
      }
    } catch (cdcError) {
      console.warn('CDC API geocoding failed:', cdcError);
    }
    
    // Fallback to direct OneMap API
    try {
      const oneMapUrl = `https://developers.onemap.sg/commonapi/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y`;
      const response = await fetch(oneMapUrl);
      
      if (response.ok) {
        const data = await response.json();
        if (data.found > 0 && data.results.length > 0) {
          const result = data.results[0];
          const coords = {
            lat: parseFloat(result.LATITUDE),
            lng: parseFloat(result.LONGITUDE)
          };
          console.log('OneMap API geocoding successful:', coords);
          return coords;
        }
      }
    } catch (oneMapError) {
      console.warn('OneMap API geocoding failed:', oneMapError);
    }
    
    console.error('All geocoding attempts failed for postal code:', postalCode);
    return null;
  } catch (error) {
    console.error('Error geocoding postal code:', error);
    return null;
  }
};

// Sort merchants by distance from a given location
export const sortMerchantsByDistance = (
  merchants: any[],
  userLat: number,
  userLng: number
): any[] => {
  return merchants
    .map(merchant => ({
      ...merchant,
      distance: calculateDistance(userLat, userLng, merchant.LAT, merchant.LON)
    }))
    .sort((a, b) => a.distance - b.distance);
};

// Find merchants within a certain radius (in kilometers)
export const findMerchantsWithinRadius = (
  merchants: any[],
  userLat: number,
  userLng: number,
  radiusKm: number = 5
): any[] => {
  return merchants.filter(merchant => {
    const distance = calculateDistance(userLat, userLng, merchant.LAT, merchant.LON);
    return distance <= radiusKm;
  });
};

// Format distance for display
export const formatDistance = (distanceKm: number): string => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  } else {
    return `${distanceKm.toFixed(1)}km`;
  }
};

// Get user's current location (if permitted)
export const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  });
};
