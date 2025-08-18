import { Merchant } from '../data/merchants';
import { geocodePostalCode, calculateDistance } from './locationUtils';

export interface FilterOptions {
  showHalalOnly: boolean;
  showOpenOnly: boolean;
  showBudgetMeals: boolean;
  category?: 'hawker' | 'heartland' | 'supermarket' | 'all';
}

export const isOpen = (merchant: Merchant): boolean => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 100 + currentMinute;
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as keyof NonNullable<Merchant['operatingHours']>;
  
  // Use real operating hours if available
  if (merchant.operatingHours && merchant.operatingHours[currentDay]) {
    const dayHours = merchant.operatingHours[currentDay];
    
    if (dayHours === 'Closed' || !dayHours) {
      return false;
    }
    
    // Parse hours format "HH:MM-HH:MM"
    const timeMatch = dayHours.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
    if (timeMatch) {
      const [, openHour, openMin, closeHour, closeMin] = timeMatch.map(Number);
      const openTime = openHour * 100 + openMin;
      const closeTime = closeHour * 100 + closeMin;
      
      // Handle overnight hours (e.g., 22:00-02:00)
      if (closeTime < openTime) {
        return currentTime >= openTime || currentTime <= closeTime;
      }
      
      return currentTime >= openTime && currentTime <= closeTime;
    }
  }
  
  // Fallback to estimated hours based on merchant type and name patterns
  const name = merchant.name.toLowerCase();
  
  // Most hawker centers and food courts
  if (merchant.type === "HAWKER_HEARTLAND_MERCHANT") {
    // Coffee shops and breakfast places
    if (name.includes('coffee') || name.includes('kopi') || name.includes('breakfast')) {
      return currentHour >= 6 && currentHour <= 14; // 6 AM - 2 PM
    }
    
    // Dinner/supper places
    if (name.includes('zi char') || name.includes('steamboat') || name.includes('bbq')) {
      return currentHour >= 17 && currentHour <= 2; // 5 PM - 2 AM
    }
    
    // Healthcare services
    if (name.includes('massage') || name.includes('wellness') || name.includes('spa') || name.includes('reflexology')) {
      return currentHour >= 10 && currentHour <= 22; // 10 AM - 10 PM
    }
    
    // General food stalls
    return currentHour >= 8 && currentHour <= 20; // 8 AM - 8 PM
  }
  
  // Supermarkets typically open longer
  if (merchant.type === "SUPERMARKET") {
    return currentHour >= 7 && currentHour <= 23; // 7 AM - 11 PM
  }
  
  // Default: 8 AM - 8 PM
  return currentHour >= 8 && currentHour <= 20;
};

export const getOperatingStatus = (merchant: Merchant): {
  isOpen: boolean;
  status: string;
  nextChange?: string;
} => {
  const merchantIsOpen = isOpen(merchant);
  const now = new Date();
  const currentHour = now.getHours();
  const name = merchant.name.toLowerCase();
  
  // Estimated hours based on merchant type (placeholder logic)
  let estimatedHours = { open: 8, close: 20 }; // Default 8 AM - 8 PM
  
  if (merchant.type === "HAWKER_HEARTLAND_MERCHANT") {
    if (name.includes('coffee') || name.includes('kopi') || name.includes('breakfast')) {
      estimatedHours = { open: 6, close: 14 }; // 6 AM - 2 PM
    } else if (name.includes('zi char') || name.includes('steamboat') || name.includes('bbq')) {
      estimatedHours = { open: 17, close: 24 }; // 5 PM - 12 AM
    } else if (name.includes('massage') || name.includes('wellness') || name.includes('spa')) {
      estimatedHours = { open: 10, close: 22 }; // 10 AM - 10 PM
    }
  } else if (merchant.type === "SUPERMARKET") {
    estimatedHours = { open: 7, close: 23 }; // 7 AM - 11 PM
  }
  
  if (merchantIsOpen) {
    const closeTime = estimatedHours.close > 24 ? 
      `${estimatedHours.close - 24}:00 AM` : 
      `${estimatedHours.close}:00`;
    return {
      isOpen: true,
      status: 'Open',
      nextChange: `Estimated to close at ${closeTime}`
    };
  } else {
    let nextOpenTime = '';
    if (currentHour < estimatedHours.open) {
      nextOpenTime = `${estimatedHours.open}:00 today`;
    } else {
      nextOpenTime = `${estimatedHours.open}:00 tomorrow`;
    }
    
    return {
      isOpen: false,
      status: 'Closed',
      nextChange: `Estimated to open at ${nextOpenTime}`
    };
  }
};

export const searchMerchants = async (
  merchants: Merchant[],
  searchTerm: string
): Promise<Merchant[]> => {
  if (!searchTerm.trim()) {
    return merchants;
  }
  
  const term = searchTerm.toLowerCase();
  
  // Extract postal code from search term (supports addresses like "320 Tampines Street 33 Singapore 520320")
  const postalCodeMatch = term.match(/\b(\d{6})\b/);
  const isPostalCodeSearch = /^\d{6}$/.test(term) || postalCodeMatch;
  
  if (isPostalCodeSearch) {
    // Use the extracted postal code or the full term if it's just digits
    const postalCode = postalCodeMatch ? postalCodeMatch[1] : term;
    
    // For postal code search, sort by distance
    try {
      const coords = await geocodePostalCode(postalCode);
      if (coords) {
        // Process in chunks to avoid blocking
        const chunkSize = 1000;
        const merchantsWithDistance: Merchant[] = [];
        
        for (let i = 0; i < merchants.length; i += chunkSize) {
          const chunk = merchants.slice(i, i + chunkSize);
          const processedChunk = chunk.map(merchant => ({
            ...merchant,
            distance: calculateDistance(coords.lat, coords.lng, merchant.LAT, merchant.LON)
          }));
          merchantsWithDistance.push(...processedChunk);
          
          // Allow UI to breathe between chunks
          if (i + chunkSize < merchants.length) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        }
        
        // Return merchants within 10km, sorted by distance
        return merchantsWithDistance
          .filter(merchant => merchant.distance !== undefined && merchant.distance <= 10)
          .sort((a, b) => (a.distance || 0) - (b.distance || 0));
      }
    } catch (error) {
      console.error('Error geocoding postal code:', error);
    }
  }
  
  // Regular text search - optimized for large datasets
  console.log(`Searching for "${term}" in ${merchants.length} merchants`);
  const results: Merchant[] = [];
  const chunkSize = 1000;
  
  for (let i = 0; i < merchants.length; i += chunkSize) {
    const chunk = merchants.slice(i, i + chunkSize);
    const filteredChunk = chunk.filter(merchant => {
      // Search by merchant name (most common search)
      if (merchant.name.toLowerCase().includes(term)) {
        return true;
      }
      
      // Search by postal code
      if (merchant.postalCode.toLowerCase().includes(term)) {
        return true;
      }
      
      // Search by address/street name
      if (merchant.address.toLowerCase().includes(term)) {
        return true;
      }
      
      // Search by merchant type
      if (merchant.type.toLowerCase().includes(term.replace(/[^a-z]/g, ''))) {
        return true;
      }
      
      // Search by cuisine
      if (merchant.cuisine && merchant.cuisine.some(cuisine => 
        cuisine.toLowerCase().includes(term)
      )) {
        return true;
      }
      
      // Search by business category (if available)
      if (merchant.businessCategory && merchant.businessCategory.toLowerCase().includes(term)) {
        return true;
      }
      
      return false;
    });
    
    results.push(...filteredChunk);
    
    // Allow UI to breathe between chunks
    if (i + chunkSize < merchants.length) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
  
  console.log(`Found ${results.length} results for "${term}"`);
  return results;
};

export const filterMerchants = (
  merchants: Merchant[],
  filters: FilterOptions
): Merchant[] => {
  return merchants.filter(merchant => {
    // Halal filter
    if (filters.showHalalOnly && !merchant.isHalal) {
      return false;
    }
    

    
    // Open/closed filter
    if (filters.showOpenOnly && !isOpen(merchant)) {
      return false;
    }
    
    // Budget meals filter (based on merchant name patterns)
    if (filters.showBudgetMeals && !isBudgetMeal(merchant)) {
      return false;
    }
    
    // Category filter - adapt to new API structure
    if (filters.category && filters.category !== 'all') {
      if (filters.category === 'hawker' && merchant.type !== 'HAWKER_HEARTLAND_MERCHANT') {
        return false;
      }
      if (filters.category === 'supermarket' && merchant.type !== 'SUPERMARKET') {
        return false;
      }
    }
    
    return true;
  });
};

// Helper function to detect budget meals - use API data
const isBudgetMeal = (merchant: Merchant): boolean => {
  // Use the official budgetmeal field from CDC API
  return merchant.filters?.secondary?.budgetmeal === true;
};

export const sortMerchants = (merchants: Merchant[], sortBy: 'name' | 'distance' | 'status'): Merchant[] => {
  return [...merchants].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'status':
        const aOpen = isOpen(a);
        const bOpen = isOpen(b);
        if (aOpen && !bOpen) return -1;
        if (!aOpen && bOpen) return 1;
        // If same status, sort by distance if available, then name
        if (a.distance !== undefined && b.distance !== undefined) {
          return a.distance - b.distance;
        }
        return a.name.localeCompare(b.name);
      case 'distance':
        // Sort by distance if available
        if (a.distance !== undefined && b.distance !== undefined) {
          return a.distance - b.distance;
        }
        // If one has distance and other doesn't, prioritize the one with distance
        if (a.distance !== undefined && b.distance === undefined) return -1;
        if (a.distance === undefined && b.distance !== undefined) return 1;
        // If neither has distance, sort by name
        return a.name.localeCompare(b.name);
      default:
        // Default sorting: prioritize distance if available, then name
        if (a.distance !== undefined && b.distance !== undefined) {
          return a.distance - b.distance;
        }
        if (a.distance !== undefined && b.distance === undefined) return -1;
        if (a.distance === undefined && b.distance !== undefined) return 1;
        return a.name.localeCompare(b.name);
    }
  });
};
