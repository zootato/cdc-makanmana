// Data management system for CSV-based storage and nightly updates

import { CDCApiResponse, Merchant, enhanceMerchantDataWithExternalSources } from '../data/merchants';

export interface EnhancedMerchantCSV {
  id: string;
  entityId: string;
  name: string;
  address: string;
  postalCode: string;
  type: string;
  LAT: number;
  LON: number;
  lastResetDate: string;
  budgetmeal: boolean;
  isHalal: boolean;
  cuisine: string; // JSON string of array
  phone?: string;
  businessCategory?: string;
  halalSource: string;
  lastUpdated: string;
  dataVersion: string;
}

export class DataManager {
  private static readonly STORAGE_KEY = 'cdc_enhanced_merchants';
  private static readonly VERSION_KEY = 'cdc_data_version';
  private static readonly LAST_UPDATE_KEY = 'cdc_last_update';
  private static readonly DATA_VERSION = '1.0';
  
  // Check if we have valid cached data
  static hasValidCachedData(): boolean {
    try {
      const lastUpdate = localStorage.getItem(this.LAST_UPDATE_KEY);
      const version = localStorage.getItem(this.VERSION_KEY);
      
      if (!lastUpdate || !version || version !== this.DATA_VERSION) {
        return false;
      }
      
      const lastUpdateDate = new Date(lastUpdate);
      const now = new Date();
      const hoursSinceUpdate = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60);
      
      // Data is valid for 24 hours
      return hoursSinceUpdate < 24;
    } catch (error) {
      console.error('Error checking cached data:', error);
      return false;
    }
  }
  
  // Load merchants from local storage
  static loadCachedMerchants(): Merchant[] {
    try {
      const cachedData = localStorage.getItem(this.STORAGE_KEY);
      if (!cachedData) return [];
      
      const csvData: EnhancedMerchantCSV[] = JSON.parse(cachedData);
      return csvData.map(this.csvToMerchant);
    } catch (error) {
      console.error('Error loading cached merchants:', error);
      return [];
    }
  }
  
  // Save merchants to local storage
  static saveMerchantsToCache(merchants: Merchant[]): void {
    try {
      const csvData = merchants.map(this.merchantToCSV);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(csvData));
      localStorage.setItem(this.LAST_UPDATE_KEY, new Date().toISOString());
      localStorage.setItem(this.VERSION_KEY, this.DATA_VERSION);
    } catch (error) {
      console.error('Error saving merchants to cache:', error);
    }
  }
  
  // Convert merchant to CSV format
  private static merchantToCSV(merchant: Merchant): EnhancedMerchantCSV {
    return {
      id: merchant.id,
      entityId: merchant.entityId,
      name: merchant.name,
      address: merchant.address,
      postalCode: merchant.postalCode,
      type: merchant.type,
      LAT: merchant.LAT,
      LON: merchant.LON,
      lastResetDate: merchant.lastResetDate,
      budgetmeal: merchant.filters?.secondary?.budgetmeal || false,
      isHalal: merchant.isHalal || false,
      cuisine: JSON.stringify(merchant.cuisine || []),
      phone: merchant.phone,
      businessCategory: merchant.businessCategory,
      halalSource: merchant.halalSource || 'KEYWORD_CHECKED',
      lastUpdated: new Date().toISOString(),
      dataVersion: this.DATA_VERSION
    };
  }
  
  // Convert CSV format to merchant
  private static csvToMerchant(csv: EnhancedMerchantCSV): Merchant {
    return {
      id: csv.id,
      entityId: csv.entityId,
      name: csv.name,
      address: csv.address,
      postalCode: csv.postalCode,
      type: csv.type as "HAWKER_HEARTLAND_MERCHANT" | "SUPERMARKET",
      LAT: csv.LAT,
      LON: csv.LON,
      filters: {
        vouchers: {
          supermarket: csv.type === "SUPERMARKET",
          hawker_heartland_merchant: csv.type === "HAWKER_HEARTLAND_MERCHANT"
        },
        secondary: {
          budgetmeal: csv.budgetmeal
        }
      },
      lastResetDate: csv.lastResetDate,
      isHalal: csv.isHalal,
      cuisine: JSON.parse(csv.cuisine || '[]'),
      phone: csv.phone,
      businessCategory: csv.businessCategory,
      halalSource: csv.halalSource
    };
  }
  
  // Full data refresh (for nightly updates)
  static async refreshAllData(progressCallback?: (progress: number, total: number) => void): Promise<Merchant[]> {
    try {
      console.log('Starting full data refresh...');
      
      // Fetch fresh CDC data
      const response = await fetch('http://prd-tmp.cdn.gowhere.gov.sg/assets/cdcvouchersgowhere/data.gzip?v=2');
      if (!response.ok) {
        throw new Error('Failed to fetch CDC data');
      }
      
      const cdcData: CDCApiResponse = await response.json();
      console.log(`Fetched ${cdcData.locations.length} merchants from CDC API`);
      
      // Enhance all merchants with external data in batches
      const batchSize = 25;
      const enhancedMerchants: Merchant[] = [];
      
      for (let i = 0; i < cdcData.locations.length; i += batchSize) {
        const batch = cdcData.locations.slice(i, i + batchSize);
        
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cdcData.locations.length / batchSize)}`);
        
        const enhancedBatch = await Promise.all(
          batch.map(async (merchant) => {
            try {
              return await enhanceMerchantDataWithExternalSources(merchant);
            } catch (error) {
              console.error(`Error enhancing merchant ${merchant.name}:`, error);
              // Return basic enhanced version on error
              const { enhanceMerchantData } = await import('../data/merchants');
              return enhanceMerchantData(merchant);
            }
          })
        );
        
        enhancedMerchants.push(...enhancedBatch);
        
        // Report progress
        if (progressCallback) {
          progressCallback(enhancedMerchants.length, cdcData.locations.length);
        }
        
        // Rate limiting - wait between batches
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Save to cache
      this.saveMerchantsToCache(enhancedMerchants);
      console.log(`Data refresh complete. Enhanced ${enhancedMerchants.length} merchants.`);
      
      return enhancedMerchants;
    } catch (error) {
      console.error('Error during data refresh:', error);
      throw error;
    }
  }
  
  // Export data to CSV file (for backup/analysis)
  static exportToCSVFile(merchants: Merchant[]): string {
    const csvData = merchants.map(this.merchantToCSV);
    const headers = Object.keys(csvData[0]).join(',');
    const rows = csvData.map(row => 
      Object.values(row).map(value => 
        typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
      ).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }
  
  // Import data from CSV file
  static importFromCSVFile(csvContent: string): Merchant[] {
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
      const values = this.parseCSVLine(line);
      const csvObj: any = {};
      
      headers.forEach((header, index) => {
        csvObj[header] = values[index];
      });
      
      return this.csvToMerchant(csvObj as EnhancedMerchantCSV);
    });
  }
  
  // Parse CSV line handling quoted values
  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }
  
  // Check if data needs refresh (for automatic updates)
  static needsRefresh(): boolean {
    return !this.hasValidCachedData();
  }
  
  // Get cache statistics
  static getCacheInfo(): {
    hasCache: boolean;
    lastUpdate: string | null;
    version: string | null;
    merchantCount: number;
  } {
    const lastUpdate = localStorage.getItem(this.LAST_UPDATE_KEY);
    const version = localStorage.getItem(this.VERSION_KEY);
    const cachedData = localStorage.getItem(this.STORAGE_KEY);
    
    return {
      hasCache: !!cachedData,
      lastUpdate,
      version,
      merchantCount: cachedData ? JSON.parse(cachedData).length : 0
    };
  }
  
  // Clear all cached data
  static clearCache(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.LAST_UPDATE_KEY);
      localStorage.removeItem(this.VERSION_KEY);
      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  // Export merchants to CSV string
  static exportToCSVString(merchants: Merchant[]): string {
    const csvData = merchants.map(this.merchantToCSV);
    
    if (csvData.length === 0) return '';
    
    // Create CSV header
    const headers = Object.keys(csvData[0]).join(',');
    
    // Create CSV rows
    const rows = csvData.map(row => 
      Object.values(row).map(value => {
        // Escape commas and quotes in CSV values
        const stringValue = String(value || '');
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }

  // Export merchants to JSON string
  static exportToJSONString(merchants: Merchant[]): string {
    return JSON.stringify(merchants, null, 2);
  }
}
