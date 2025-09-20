// Real API interfaces based on CDC vouchers data
export interface CDCApiMerchant {
  id: string;
  entityId: string;
  name: string;
  address: string;
  postalCode: string;
  type: "HAWKER_HEARTLAND_MERCHANT" | "SUPERMARKET";
  LAT: number;
  LON: number;
  filters: {
    vouchers: {
      supermarket: boolean;
      hawker_heartland_merchant: boolean;
    };
    secondary: {
      budgetmeal: boolean;
    };
  };
  lastResetDate: string;
}

export interface CDCApiResponse {
  lastUpdated: string;
  locations: CDCApiMerchant[];
}

// Enhanced merchant interface with additional data
export interface Merchant extends CDCApiMerchant {
  // Additional fields we'll enhance with
  isHalal?: boolean;
  cuisine?: string[];
  phone?: string;
  description?: string;
  distance?: number; // Distance in kilometers
  businessCategory?: string;
  halalSource?: string;
}

// API service for fetching CDC vouchers data
export const fetchCDCMerchants = async (): Promise<CDCApiResponse> => {
  try {
    // Try HTTPS first (more secure and likely to work in production)
    const httpsUrl = 'https://prd-tmp.cdn.gowhere.gov.sg/assets/cdcvouchersgowhere/data.gzip?v=2';
    
    try {
      console.log('Trying HTTPS CDC API...');
      const response = await fetch(httpsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, */*',
          'Accept-Encoding': 'gzip, deflate, br',
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const data = await response.json();
        console.log('HTTPS CDC API success - got', data.locations?.length, 'merchants');
        return data;
      }
      console.warn('HTTPS CDC API failed with status:', response.status);
    } catch (httpsError) {
      console.warn('HTTPS CDC API error:', httpsError);
    }
    
    // Fallback to HTTP with proxy
    const httpUrl = 'http://prd-tmp.cdn.gowhere.gov.sg/assets/cdcvouchersgowhere/data.gzip?v=2';
    console.log('Trying HTTP CDC API with proxy...');
    
    const { fetchWithProxy } = await import('../utils/proxyUtils');
    const data = await fetchWithProxy(httpUrl);
    
    if (data && data.locations) {
      return data;
    }
    
    throw new Error('No valid data received from CDC API');
  } catch (error) {
    console.error('Error fetching CDC merchants:', error);
    throw error;
  }
};

// Enhanced merchant detection based on name patterns (basic version)
export const enhanceMerchantData = async (merchant: CDCApiMerchant): Promise<Merchant> => {
  const name = merchant.name.toLowerCase();

  const enhanced: Merchant = {
    ...merchant,
    isHalal: false, // Will be determined later when halal filter is used
    halalSource: 'NOT_CHECKED',
    cuisine: detectCuisine(name),
  };

  return enhanced;
};

// Enhanced merchant detection with external data (async version)
export const enhanceMerchantDataWithExternalSources = async (merchant: CDCApiMerchant): Promise<Merchant> => {
  // Start with basic enhancement
  const basicEnhanced = enhanceMerchantData(merchant);
  
  try {
    // Import external services dynamically to avoid blocking
    const { DataEnhancementService } = await import('../services/externalData');
    
    // Get enhanced data from external sources
    const fullyEnhanced = await DataEnhancementService.enhanceMerchantWithExternalData(basicEnhanced);
    
    return fullyEnhanced;
  } catch (error) {
    console.error('Error enhancing with external data:', error);
    // Return basic enhanced version if external services fail
    return basicEnhanced;
  }
};



const detectCuisine = (name: string): string[] => {
  const cuisineMap: { [key: string]: string[] } = {
    'chinese': ['chinese', 'zi char', 'chicken rice', 'wanton', 'noodle', 'dumpling', 'dim sum', 'roast', 'char siew'],
    'malay': ['malay', 'nasi', 'rendang', 'satay', 'mee', 'laksa', 'warung'],
    'indian': ['indian', 'curry', 'biryani', 'tandoor', 'roti', 'dhal', 'masala'],
    'western': ['western', 'pizza', 'burger', 'pasta', 'steak', 'sandwich'],
    'japanese': ['japanese', 'sushi', 'ramen', 'udon', 'teriyaki', 'bento'],
    'korean': ['korean', 'kimchi', 'bbq', 'ginseng'],
    'thai': ['thai', 'tom yum', 'pad thai', 'green curry'],
    'vietnamese': ['vietnamese', 'pho', 'banh mi'],
    'indonesian': ['indonesian', 'gado gado', 'rendang', 'nasi gudeg'],
    'vegetarian': ['vegetarian', 'vegan', 'tofu', 'mock meat'],
    'halal': ['halal', 'muslim'],
    'seafood': ['fish', 'seafood', 'prawn', 'crab', 'lobster'],
    'local': ['local', 'hawker', 'kopitiam'],
    'dessert': ['ice cream', 'cake', 'dessert', 'sweet'],
    'drinks': ['coffee', 'tea', 'juice', 'bubble tea']
  };

  const detectedCuisines: string[] = [];
  
  Object.entries(cuisineMap).forEach(([cuisine, keywords]) => {
    if (keywords.some(keyword => name.includes(keyword))) {
      detectedCuisines.push(cuisine.charAt(0).toUpperCase() + cuisine.slice(1));
    }
  });

  return detectedCuisines.length > 0 ? detectedCuisines : ['Local'];
};
