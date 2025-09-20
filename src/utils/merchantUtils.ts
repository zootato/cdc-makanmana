import { Merchant } from '../data/merchants';
import { geocodePostalCode, calculateDistance } from './locationUtils';

export interface FilterOptions {
  showHalalOnly: boolean;
  showBudgetMeals: boolean;
  category?: 'hawker' | 'heartland' | 'supermarket' | 'all';
}





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

export const filterMerchants = async (
  merchants: Merchant[],
  filters: FilterOptions
): Promise<Merchant[]> => {
  // If halal filter is enabled, check halal status for all merchants
  if (filters.showHalalOnly) {
    const { HalalService } = await import('../services/halalService');

    const halalCheckedMerchants = await Promise.all(
      merchants.map(async (merchant) => {
        if (merchant.halalSource === 'NOT_CHECKED') {
          const halalResult = await HalalService.isHalal(merchant);
          return {
            ...merchant,
            isHalal: halalResult.isHalal,
            halalSource: halalResult.source
          };
        }
        return merchant;
      })
    );

    return halalCheckedMerchants.filter(merchant => merchant.isHalal);
  }

  // For other filters, use regular filtering
  return merchants.filter(merchant => {
    

    

    
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

export const sortMerchants = (merchants: Merchant[], sortBy: 'name' | 'distance'): Merchant[] => {
  return [...merchants].sort((a, b) => {
    switch (sortBy) {
      case 'name':
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
