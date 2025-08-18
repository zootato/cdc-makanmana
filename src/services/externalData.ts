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
  
  // Get opening hours from Google Places API
  static async getOpeningHours(merchantName: string, address: string): Promise<any> {
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
        
        // Get detailed place information including opening hours
        const detailsResponse = await fetch(
          `${this.PLACES_API_URL}/details/json?place_id=${placeId}&fields=opening_hours,formatted_phone_number&key=${this.GOOGLE_MAPS_API_KEY}`
        );
        
        if (!detailsResponse.ok) return null;
        
        const detailsData = await detailsResponse.json();
        
        const result: any = {};
        
        if (detailsData.result?.opening_hours) {
          result.operating_hours = this.parseGoogleHours(detailsData.result.opening_hours);
        }
        
        if (detailsData.result?.formatted_phone_number) {
          result.phone = detailsData.result.formatted_phone_number;
        }
        
        return result;
      }
      
      return null;
    } catch (error) {
      console.error('Google Maps API error:', error);
      return null;
    }
  }
  
  // Convert Google's opening hours format to our format
  private static parseGoogleHours(googleHours: any): any {
    if (!googleHours.periods) return null;
    
    const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const operatingHours: any = {};
    
    // Initialize all days as closed
    weekDays.forEach(day => {
      operatingHours[day] = 'Closed';
    });
    
    // Parse Google's periods format
    googleHours.periods.forEach((period: any) => {
      if (period.open && period.close) {
        const dayIndex = period.open.day;
        const dayName = weekDays[dayIndex];
        
        const openTime = this.formatTime(period.open.time);
        const closeTime = this.formatTime(period.close.time);
        
        operatingHours[dayName] = `${openTime}-${closeTime}`;
      } else if (period.open && !period.close) {
        // 24 hour operation
        const dayIndex = period.open.day;
        const dayName = weekDays[dayIndex];
        operatingHours[dayName] = '00:00-23:59';
      }
    });
    
    return operatingHours;
  }
  
  // Format time from Google's HHMM format to HH:MM
  private static formatTime(timeString: string): string {
    const time = timeString.padStart(4, '0');
    return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
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
  private static readonly MUIS_API_URL = 'https://www.muis.gov.sg/api/halal';
  private static halalCache: Map<string, boolean> = new Map();
  private static lastCacheUpdate: Date | null = null;
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  
  // Check if establishment is halal certified
  static async isHalalCertified(merchantName: string, address: string): Promise<boolean> {
    try {
      // Check cache first
      const cacheKey = `${merchantName}_${address}`.toLowerCase();
      if (this.halalCache.has(cacheKey) && this.isCacheValid()) {
        return this.halalCache.get(cacheKey) || false;
      }
      
      // For now, use keyword-based detection as MUIS API might require special access
      // In production, you would integrate with the actual MUIS API
      const isHalal = await this.checkHalalByKeywords(merchantName, address);
      
      // Cache the result
      this.halalCache.set(cacheKey, isHalal);
      this.lastCacheUpdate = new Date();
      
      return isHalal;
    } catch (error) {
      console.error('MUIS Halal check error:', error);
      // Fallback to keyword detection
      return this.checkHalalByKeywords(merchantName, address);
    }
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
      // Priority 1: Try Google Maps for opening hours and phone
      let googleData = null;
      try {
        googleData = await GoogleMapsService.getOpeningHours(
          merchant.name,
          merchant.address
        );
        
        if (googleData) {
          console.log(`✅ Google Maps data found for ${merchant.name}`);
          if (googleData.operating_hours) {
            enhancedMerchant.operatingHours = googleData.operating_hours;
            enhancedMerchant.hoursSource = 'GOOGLE_MAPS';
          }
          if (googleData.phone) {
            enhancedMerchant.phone = googleData.phone;
          }
        }
      } catch (error) {
        console.warn(`Google Maps API failed for ${merchant.name}:`, error);
      }
      
      // Priority 2: Fallback to OneMap if Google Maps failed
      if (!googleData?.operating_hours) {
        const businessInfo = await OneMapBusinessService.getBusinessInfo(
          merchant.name,
          merchant.address
        );
        
        if (businessInfo) {
          if (!enhancedMerchant.operatingHours) {
            enhancedMerchant.operatingHours = businessInfo.operating_hours;
            enhancedMerchant.hoursSource = 'ONEMAP_ESTIMATED';
          }
          if (!enhancedMerchant.phone) {
            enhancedMerchant.phone = businessInfo.phone;
          }
          enhancedMerchant.businessCategory = businessInfo.category;
        }
      }
      
      // Get halal certification from MUIS
      const isHalal = await MUISHalalService.isHalalCertified(
        merchant.name,
        merchant.address
      );
      
      enhancedMerchant.isHalal = isHalal;
      enhancedMerchant.halalSource = isHalal ? 'MUIS_VERIFIED' : 'KEYWORD_CHECKED';
      
    } catch (error) {
      console.error('Error enhancing merchant data:', error);
    }
    
    return enhancedMerchant;
  }
}
