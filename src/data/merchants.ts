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
  isVegetarian?: boolean;
  hasVegetarianOptions?: boolean;
  cuisine?: string[];
  operatingHours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  phone?: string;
  description?: string;
  isOpen?: boolean;
  distance?: number; // Distance in kilometers
  businessCategory?: string;
  halalSource?: string;
  hoursSource?: 'GOOGLE_MAPS' | 'ONEMAP_ESTIMATED' | 'FALLBACK';
}

// API service for fetching CDC vouchers data
export const fetchCDCMerchants = async (): Promise<CDCApiResponse> => {
  try {
    const response = await fetch('http://prd-tmp.cdn.gowhere.gov.sg/assets/cdcvouchersgowhere/data.gzip?v=2');
    if (!response.ok) {
      throw new Error('Failed to fetch CDC vouchers data');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching CDC merchants:', error);
    throw error;
  }
};

// Enhanced merchant detection based on name patterns (basic version)
export const enhanceMerchantData = (merchant: CDCApiMerchant): Merchant => {
  const name = merchant.name.toLowerCase();
  const enhanced: Merchant = {
    ...merchant,
    isHalal: detectHalal(name),
    isVegetarian: detectVegetarian(name),
    hasVegetarianOptions: detectVegetarianOptions(name),
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

const detectHalal = (name: string): boolean => {
  const halalKeywords = [
    'halal', 'muslim', 'islamic', 'bismillah', 'salam', 'warung', 
    'nasi padang', 'makan', 'ayam', 'kambing', 'rendang', 'satay',
    'kebab', 'turkish', 'arab', 'middle east', 'biryani'
  ];
  return halalKeywords.some(keyword => name.includes(keyword));
};

const detectVegetarian = (name: string): boolean => {
  const vegetarianKeywords = [
    'vegetarian', 'vegan', 'veggie', 'loving hut', 'temple', 
    'buddhist', 'monk', 'green', 'plant based'
  ];
  return vegetarianKeywords.some(keyword => name.includes(keyword));
};

const detectVegetarianOptions = (name: string): boolean => {
  const vegOptionsKeywords = [
    'vegetables', 'veggie', 'tofu', 'bean curd', 'mixed rice',
    'cai png', 'economy rice', 'zi char', 'chinese', 'indian'
  ];
  return vegOptionsKeywords.some(keyword => name.includes(keyword));
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
