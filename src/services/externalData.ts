// External data services for OneMap and MUIS integration

export interface OneMapBusinessInfo {
  name: string;
  address: string;
  postal: string;
  operating_hours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  phone?: string;
  category?: string;
}

export interface MUISHalalInfo {
  establishment_name: string;
  address: string;
  postal_code: string;
  certificate_no: string;
  valid_from: string;
  valid_to: string;
  status: string;
  halal_type: string;
}

// Google Maps Places API Integration
export class GoogleMapsService {
  private static readonly GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  private static readonly PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place';
  
  // Get phone number from Google Places API
  static async getPhoneNumber(merchantName: string, address: string): Promise<string | null> {
    if (!this.GOOGLE_MAPS_API_KEY) {
      console.warn('Google Maps API key not configured');
      return null;
    }
    
    try {
      // First, search for the place to get place_id
      const searchQuery = `${merchantName} ${address} Singapore`;
      const searchResponse = await fetch(
        `${this.PLACES_API_URL}/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${this.GOOGLE_MAPS_API_KEY}`
      );
      
      if (!searchResponse.ok) return null;
      
      const searchData = await searchResponse.json();
      
      if (searchData.results && searchData.results.length > 0) {
        const placeId = searchData.results[0].place_id;
        
        // Get detailed place information including phone number
        const detailsResponse = await fetch(
          `${this.PLACES_API_URL}/details/json?place_id=${placeId}&fields=formatted_phone_number&key=${this.GOOGLE_MAPS_API_KEY}`
        );
        
        if (!detailsResponse.ok) return null;
        
        const detailsData = await detailsResponse.json();
        
        return detailsData.result?.formatted_phone_number || null;
      }
      
      return null;
    } catch (error) {
      console.error('Google Maps API error:', error);
      return null;
    }
  }


}

// OneMap Business Directory Integration
export class OneMapBusinessService {
  private static readonly BASE_URL = 'https://developers.onemap.sg/privateapi/popapi/getAllPOIs';
  private static readonly SEARCH_URL = 'https://developers.onemap.sg/commonapi/search';
  
  // Get business information including operating hours
  static async getBusinessInfo(merchantName: string, address: string): Promise<OneMapBusinessInfo | null> {
    try {
      // Search for the business using name and address
      const searchResponse = await fetch(
        `${this.SEARCH_URL}?searchVal=${encodeURIComponent(merchantName + ' ' + address)}&returnGeom=Y&getAddrDetails=Y`
      );
      
      if (!searchResponse.ok) return null;
      
      const searchData = await searchResponse.json();
      
      if (searchData.found > 0 && searchData.results.length > 0) {
        const result = searchData.results[0];
        
        // Extract basic info
        const businessInfo: OneMapBusinessInfo = {
          name: result.SEARCHVAL || merchantName,
          address: result.ADDRESS || address,
          postal: result.POSTAL || '',
          phone: result.PHONE || undefined,
          category: result.CATEGORY || undefined
        };
        
        // Try to get additional POI data for operating hours
        // Note: OneMap's POI API might require authentication
        // For now, we'll use pattern matching based on business type
        businessInfo.operating_hours = this.estimateHoursFromCategory(result.CATEGORY || merchantName);
        
        return businessInfo;
      }
      
      return null;
    } catch (error) {
      console.error('OneMap API error:', error);
      return null;
    }
  }
  
  // Estimate operating hours based on business category
  private static estimateHoursFromCategory(category: string): OneMapBusinessInfo['operating_hours'] {
    const cat = category.toLowerCase();
    
    if (cat.includes('restaurant') || cat.includes('food') || cat.includes('dining')) {
      return {
        monday: '11:00-22:00',
        tuesday: '11:00-22:00',
        wednesday: '11:00-22:00',
        thursday: '11:00-22:00',
        friday: '11:00-23:00',
        saturday: '11:00-23:00',
        sunday: '11:00-22:00'
      };
    }
    
    if (cat.includes('coffee') || cat.includes('cafe') || cat.includes('breakfast')) {
      return {
        monday: '07:00-15:00',
        tuesday: '07:00-15:00',
        wednesday: '07:00-15:00',
        thursday: '07:00-15:00',
        friday: '07:00-15:00',
        saturday: '07:00-15:00',
        sunday: '08:00-14:00'
      };
    }
    
    if (cat.includes('supermarket') || cat.includes('grocery') || cat.includes('mart')) {
      return {
        monday: '08:00-22:00',
        tuesday: '08:00-22:00',
        wednesday: '08:00-22:00',
        thursday: '08:00-22:00',
        friday: '08:00-22:00',
        saturday: '08:00-22:00',
        sunday: '08:00-21:00'
      };
    }
    
    if (cat.includes('massage') || cat.includes('spa') || cat.includes('wellness')) {
      return {
        monday: '10:00-22:00',
        tuesday: '10:00-22:00',
        wednesday: '10:00-22:00',
        thursday: '10:00-22:00',
        friday: '10:00-22:00',
        saturday: '10:00-22:00',
        sunday: '10:00-20:00'
      };
    }
    
    // Default business hours
    return {
      monday: '09:00-18:00',
      tuesday: '09:00-18:00',
      wednesday: '09:00-18:00',
      thursday: '09:00-18:00',
      friday: '09:00-18:00',
      saturday: '09:00-17:00',
      sunday: 'Closed'
    };
  }
}

// MUIS Halal Certification Service
export class MUISHalalService {
  private static readonly MUIS_API_URL = 'https://halal.muis.gov.sg/api/halal/establishments';
  private static halalCache: Map<string, { isHalal: boolean; details: any }> = new Map();
  private static lastCacheUpdate: Date | null = null;
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly ENABLE_BROWSER_API_CALLS = true; // Use proxy server for real MUIS verification
  private static readonly MUIS_PROXY_URL = 'http://localhost:3001/api/muis-halal'; // Local proxy server
  
  // Check if establishment is halal certified using MUIS API
  static async isHalalCertified(merchantName: string, address: string): Promise<boolean> {
    try {
      // Check cache first
      const cacheKey = `${merchantName}_${address}`.toLowerCase();
      if (this.halalCache.has(cacheKey) && this.isCacheValid()) {
        return this.halalCache.get(cacheKey)?.isHalal || false;
      }
      
      // Try MUIS API first
      const muisResult = await this.checkMUISAPI(merchantName);
      
      if (muisResult !== null) {
        // Cache MUIS result
        this.halalCache.set(cacheKey, { isHalal: muisResult.isHalal, details: muisResult.details });
        this.lastCacheUpdate = new Date();
        console.log(`✅ MUIS API verified: ${merchantName} - ${muisResult.isHalal ? 'HALAL' : 'NOT CERTIFIED'}`);
        return muisResult.isHalal;
      }
      
      // Fallback to keyword detection if MUIS API fails
      console.warn(`⚠️ MUIS API failed for ${merchantName}, using keyword detection`);
      const keywordResult = await this.checkHalalByKeywords(merchantName, address);
      
      // Cache keyword result
      this.halalCache.set(cacheKey, { isHalal: keywordResult, details: null });
      this.lastCacheUpdate = new Date();
      
      return keywordResult;
    } catch (error) {
      console.error('MUIS Halal check error:', error);
      // Final fallback to keyword detection
      return this.checkHalalByKeywords(merchantName, address);
    }
  }
  
  // Check MUIS API for halal certification
  private static async checkMUISAPI(merchantName: string): Promise<{ isHalal: boolean; details: any } | null> {
    try {
      // Use proxy server for browser environments to handle CSRF
      const apiUrl = typeof window !== 'undefined' ? this.MUIS_PROXY_URL : this.MUIS_API_URL;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          text: merchantName.trim()
        })
      });
      
      if (!response.ok) {
        if (response.status === 400) {
          console.warn(`🔒 MUIS API requires CSRF token (${response.status}) for: ${merchantName}`);
          console.info('💡 Consider setting up a proxy server for full MUIS integration');
        } else {
          console.warn(`MUIS API returned ${response.status} for: ${merchantName}`);
        }
        return null;
      }
      
      const apiResponse = await response.json();
      
      // Handle proxy server response format vs direct MUIS API format
      let establishments = [];
      if (apiResponse.results && Array.isArray(apiResponse.results)) {
        // Proxy server response format
        establishments = apiResponse.results;
        console.log(`📡 Proxy server response: ${apiResponse.totalRecords} total records`);
      } else if (apiResponse.data && Array.isArray(apiResponse.data)) {
        // Direct MUIS API response format
        establishments = apiResponse.data;
      }
      
      if (establishments.length === 0) {
        // No results means not certified
        return {
          isHalal: false,
          details: null
        };
      }
        
        // Check if any establishment is a close match to our merchant name
        const merchantNameLower = merchantName.toLowerCase();
        const matchingEstablishment = establishments.find((establishment: any) => {
          const establishmentName = establishment.name.toLowerCase();
          
          // Direct name match
          if (establishmentName.includes(merchantNameLower) || merchantNameLower.includes(establishmentName)) {
            return true;
          }
          
          // Check for partial matches (removing common words)
          const cleanMerchantName = merchantNameLower
            .replace(/\b(pte|ltd|singapore|s\)|restaurant|cafe|food|stall|@|#\d+|\(.*?\))\b/g, '')
            .trim();
          const cleanEstablishmentName = establishmentName
            .replace(/\b(pte|ltd|singapore|s\)|restaurant|cafe|food|stall|@|#\d+|\(.*?\))\b/g, '')
            .trim();
          
          // Check if core names match (minimum 3 characters)
          if (cleanMerchantName.length >= 3 && cleanEstablishmentName.length >= 3) {
            // Try both directions for partial matches
            if (cleanEstablishmentName.includes(cleanMerchantName) || 
                cleanMerchantName.includes(cleanEstablishmentName)) {
              return true;
            }
            
            // Check word-by-word matching for compound names
            const merchantWords = cleanMerchantName.split(' ').filter((word: string) => word.length >= 3);
            const establishmentWords = cleanEstablishmentName.split(' ').filter((word: string) => word.length >= 3);
            
            // If at least 2 significant words match, consider it a match
            const matchingWords = merchantWords.filter((word: string) => 
              establishmentWords.some((estWord: string) => estWord.includes(word) || word.includes(estWord))
            );
            
            if (matchingWords.length >= 2 || 
                (merchantWords.length <= 2 && matchingWords.length >= 1)) {
              return true;
            }
          }
          
          return false;
        });
        
        if (matchingEstablishment) {
          console.log(`🕌 MUIS VERIFIED: ${merchantName} matches "${matchingEstablishment.name}" (Cert: ${matchingEstablishment.number})`);
          return {
            isHalal: true,
            details: {
              matchedEstablishment: matchingEstablishment,
              totalFound: establishments.length,
              searchResults: establishments
            }
          };
        }
        
        // Found results but no close match
        console.log(`⚠️ MUIS: Found ${establishments.length} results for "${merchantName}" but no close matches`);
        return {
          isHalal: false,
          details: {
            searchResults: establishments,
            totalFound: establishments.length
          }
        };
      
      // Invalid response format
      console.warn('MUIS API returned unexpected response format');
      return null;
      
    } catch (error) {
      // Handle CORS errors gracefully
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.warn(`🚫 MUIS API CORS blocked for: ${merchantName}. This is expected when running from browser.`);
        console.info('💡 MUIS API integration works best from server-side or with proxy setup');
      } else {
        console.error('Error calling MUIS API:', error);
      }
      return null;
    }
  }
  
  // Get halal certification status with source information
  static async getHalalCertificationStatus(merchantName: string, address: string): Promise<{ isHalal: boolean; source: string }> {
    try {
      // Skip MUIS API in browser environment if disabled to avoid CSRF errors
      if (typeof window !== 'undefined' && !this.ENABLE_BROWSER_API_CALLS) {
        // Use enhanced keyword detection in browser to avoid CSRF issues
        const keywordResult = await this.checkHalalByKeywords(merchantName, address);
        return {
          isHalal: keywordResult,
          source: keywordResult ? 'KEYWORD_DETECTED' : 'NOT_DETECTED'
        };
      }
      
      // Server-side: Try MUIS API first
      const cleanMerchantName = this.cleanMerchantNameForSearch(merchantName);
      console.log(`🔍 Checking MUIS API for CDC merchant: "${merchantName}" (cleaned: "${cleanMerchantName}")`);
      const muisResult = await this.checkMUISAPI(cleanMerchantName);
      
      if (muisResult !== null) {
        const source = muisResult.isHalal ? 'MUIS_VERIFIED' : 'MUIS_NOT_FOUND';
        console.log(`🕌 MUIS Result for "${merchantName}": ${muisResult.isHalal ? 'HALAL CERTIFIED' : 'NOT CERTIFIED'} (${source})`);
        return {
          isHalal: muisResult.isHalal,
          source: source
        };
      }
      
      // Fallback to enhanced keyword detection
      console.info(`🔍 MUIS API unavailable, using enhanced keyword detection for: ${merchantName}`);
      const keywordResult = await this.checkHalalByKeywords(merchantName, address);
      return {
        isHalal: keywordResult,
        source: keywordResult ? 'KEYWORD_DETECTED' : 'NOT_DETECTED'
      };
      
    } catch (error) {
      console.error('Error getting halal certification status:', error);
      // Final fallback
      const keywordResult = await this.checkHalalByKeywords(merchantName, address);
      return {
        isHalal: keywordResult,
        source: keywordResult ? 'KEYWORD_DETECTED' : 'NOT_DETECTED'
      };
    }
  }
  
  // Clean merchant name for better MUIS API searching
  private static cleanMerchantNameForSearch(merchantName: string): string {
    return merchantName
      // Remove common business suffixes
      .replace(/\b(pte ltd|pte|ltd|singapore|s'pore|sgp)\b/gi, '')
      // Remove stall numbers and location indicators
      .replace(/#\d+[-\w]*|\(.*?\)|@.*$/gi, '')
      // Remove extra whitespace
      .trim()
      // Use first few meaningful words if name is too long
      .split(' ')
      .slice(0, 4)
      .join(' ')
      .trim();
  }
  
  // Fallback method using keywords (enhanced version)
  private static async checkHalalByKeywords(merchantName: string, address: string): Promise<boolean> {
    const text = `${merchantName} ${address}`.toLowerCase();
    
    const halalKeywords = [
      // Direct halal indicators
      'halal', 'muslim', 'islamic', 'bismillah', 'assalam', 'salam',
      
      // Cuisine types commonly halal
      'turkish', 'arab', 'arabian', 'middle east', 'lebanese', 'moroccan',
      'pakistani', 'afghan', 'persian', 'kurdish',
      
      // Malay/Indonesian (high probability)
      'warung', 'nasi padang', 'makan', 'warong', 'mamak',
      'rendang', 'satay', 'gado gado', 'nasi lemak', 'laksa',
      
      // Indian Muslim
      'biryani', 'tandoor', 'mutton', 'kebab', 'korma',
      
      // Business names indicating halal
      'al-', 'ibn', 'abu', 'fatimah', 'aisha', 'khadijah',
      'rahman', 'rahim', 'allah', 'mosque', 'masjid'
    ];
    
    const nonHalalKeywords = [
      'pork', 'bacon', 'ham', 'char siew', 'siu mai',
      'wine', 'beer', 'alcohol', 'bar', 'pub'
    ];
    
    // Check for non-halal indicators first
    if (nonHalalKeywords.some(keyword => text.includes(keyword))) {
      return false;
    }
    
    // Check for halal indicators
    return halalKeywords.some(keyword => text.includes(keyword));
  }
  
  // Get full halal certification details (if API access available)
  static async getHalalCertificationDetails(merchantName: string): Promise<MUISHalalInfo | null> {
    try {
      // This would require actual MUIS API integration
      // For now, return null as placeholder
      console.log(`Getting MUIS certification for: ${merchantName}`);
      return null;
    } catch (error) {
      console.error('MUIS certification details error:', error);
      return null;
    }
  }
  
  private static isCacheValid(): boolean {
    if (!this.lastCacheUpdate) return false;
    return (Date.now() - this.lastCacheUpdate.getTime()) < this.CACHE_DURATION;
  }
  
  // Clear cache manually if needed
  static clearCache(): void {
    this.halalCache.clear();
    this.lastCacheUpdate = null;
  }
}

// Combined data enhancement service
export class DataEnhancementService {
  static async enhanceMerchantWithExternalData(merchant: any) {
    const enhancedMerchant = { ...merchant };
    
    try {
      // Priority 1: Try Google Maps for phone number
      let googlePhone = null;
      try {
        googlePhone = await GoogleMapsService.getPhoneNumber(
          merchant.name,
          merchant.address
        );
        
        if (googlePhone) {
          console.log(`✅ Google Maps phone found for ${merchant.name}`);
          enhancedMerchant.phone = googlePhone;
        }
      } catch (error) {
        console.warn(`Google Maps API failed for ${merchant.name}:`, error);
      }
      
      // Priority 2: Fallback to OneMap if Google Maps failed for phone
      if (!googlePhone) {
        const businessInfo = await OneMapBusinessService.getBusinessInfo(
          merchant.name,
          merchant.address
        );
        
        if (businessInfo) {
          if (!enhancedMerchant.phone) {
            enhancedMerchant.phone = businessInfo.phone;
          }
          enhancedMerchant.businessCategory = businessInfo.category;
        }
      }
      
      // Get halal certification from MUIS
      const halalResult = await MUISHalalService.getHalalCertificationStatus(
        merchant.name,
        merchant.address
      );
      
      enhancedMerchant.isHalal = halalResult.isHalal;
      enhancedMerchant.halalSource = halalResult.source;
      
    } catch (error) {
      console.error('Error enhancing merchant data:', error);
    }
    
    return enhancedMerchant;
  }
}
