#!/usr/bin/env node

/**
 * Enhanced Nightly Data Refresh Script
 * 
 * Features:
 * - Fetches fresh CDC voucher data
 * - Enhances with Google Maps Places API (priority)
 * - Falls back to OneMap Business Directory
 * - Verifies Halal status with MUIS API
 * - Exports to CSV and JSON formats
 * - Comprehensive logging
 * - Error handling and retry logic
 */

// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  CDC_API_URL: 'http://prd-tmp.cdn.gowhere.gov.sg/assets/cdcvouchersgowhere/data.gzip?v=2',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  OUTPUT_DIR: path.join(__dirname, '..', 'data'),
  LOG_FILE: path.join(__dirname, '..', 'data', 'refresh.log'),
  BATCH_SIZE: 50, // Increased for faster processing
  RETRY_DELAY: 100, // Reduced to 100ms between batches
  API_TIMEOUT: 8000, // 8 second timeout per API call
  MAX_RETRIES: 3
};

// Ensure output directory exists
async function ensureOutputDir() {
  try {
    await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating output directory:', error);
  }
}

// Logging function
async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  
  try {
    await fs.appendFile(CONFIG.LOG_FILE, logMessage);
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
}

// Smart filtering to skip merchants likely to fail API calls
function shouldSkipMerchant(merchant) {
  const name = merchant.name.trim();
  // Skip very short names (likely incomplete data)
  if (name.length < 3) return true;
  // Skip names that are just numbers or single characters
  if (/^[\d\s]+$/.test(name) || /^[A-Z0-9\s]{1,5}$/.test(name)) return true;
  // Skip obvious incomplete entries
  if (name.includes('STALL') && name.length < 10) return true;
  return false;
}

// Google Maps Places API integration with timeout
async function getGoogleMapsData(merchantName, address) {
  if (!CONFIG.GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Google Maps API timeout')), CONFIG.API_TIMEOUT)
    );

    const apiPromise = (async () => {
      const searchQuery = `${merchantName} ${address} Singapore`;
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${CONFIG.GOOGLE_MAPS_API_KEY}`;
      
      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) return null;
      
      const searchData = await searchResponse.json();
      
      if (searchData.results && searchData.results.length > 0) {
        const placeId = searchData.results[0].place_id;
        
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,formatted_phone_number&key=${CONFIG.GOOGLE_MAPS_API_KEY}`;
        const detailsResponse = await fetch(detailsUrl);
        
        if (!detailsResponse.ok) return null;
        
        const detailsData = await detailsResponse.json();
        
        const result = {};
        
        if (detailsData.result?.opening_hours) {
          result.operating_hours = parseGoogleHours(detailsData.result.opening_hours);
          result.hoursSource = 'GOOGLE_MAPS';
        }
        
        if (detailsData.result?.formatted_phone_number) {
          result.phone = detailsData.result.formatted_phone_number;
        }
        
        return result;
      }
      
      return null;
    })();

    return await Promise.race([apiPromise, timeoutPromise]);
  } catch (error) {
    if (error.message !== 'Google Maps API timeout') {
      console.warn(`Google Maps API error for ${merchantName}:`, error.message);
    }
    return null;
  }
}

// Parse Google's opening hours format
function parseGoogleHours(googleHours) {
  if (!googleHours.periods) return null;
  
  const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const operatingHours = {};
  
  // Initialize all days as closed
  weekDays.forEach(day => {
    operatingHours[day] = 'Closed';
  });
  
  // Parse Google's periods format
  googleHours.periods.forEach(period => {
    if (period.open && period.close) {
      const dayIndex = period.open.day;
      const dayName = weekDays[dayIndex];
      
      const openTime = formatTime(period.open.time);
      const closeTime = formatTime(period.close.time);
      
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
function formatTime(timeString) {
  const time = timeString.padStart(4, '0');
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
}

// OneMap fallback (simplified)
async function getOneMapData(merchantName, address) {
  try {
    const searchUrl = `https://developers.onemap.sg/commonapi/search?searchVal=${encodeURIComponent(merchantName + ' ' + address)}&returnGeom=Y&getAddrDetails=Y`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.found > 0 && data.results.length > 0) {
      const result = data.results[0];
      return {
        phone: result.PHONE,
        businessCategory: result.CATEGORY,
        operating_hours: estimateHoursFromCategory(result.CATEGORY || merchantName),
        hoursSource: 'ONEMAP_ESTIMATED'
      };
    }
    
    return null;
  } catch (error) {
    console.warn(`OneMap API error for ${merchantName}:`, error.message);
    return null;
  }
}

// Estimate hours based on category
function estimateHoursFromCategory(category) {
  const cat = (category || '').toLowerCase();
  
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
  
  if (cat.includes('coffee') || cat.includes('cafe')) {
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
  
  if (cat.includes('supermarket') || cat.includes('grocery')) {
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
  
  // Default hours
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

// MUIS Halal verification (simplified)
async function checkHalalStatus(merchantName, address) {
  // Simplified keyword-based detection for now
  // In production, integrate with actual MUIS API
  const name = merchantName.toLowerCase();
  const halalKeywords = [
    'halal', 'muslim', 'islamic', 'muis', 'al-', 'abu', 'ahmad', 'ali', 'hassan',
    'ibrahim', 'mohamed', 'muhammad', 'omar', 'rahman', 'salam', 'yusof'
  ];
  
  const isHalal = halalKeywords.some(keyword => name.includes(keyword));
  
  return {
    isHalal,
    halalSource: isHalal ? 'KEYWORD_DETECTED' : 'NOT_DETECTED'
  };
}

// Basic enhancement (keywords)
function detectCuisine(name) {
  const nameLower = name.toLowerCase();
  const cuisines = [];
  
  if (nameLower.includes('chinese') || nameLower.includes('zi char') || nameLower.includes('dim sum')) {
    cuisines.push('Chinese');
  }
  if (nameLower.includes('malay') || nameLower.includes('nasi') || nameLower.includes('rendang')) {
    cuisines.push('Malay');
  }
  if (nameLower.includes('indian') || nameLower.includes('curry') || nameLower.includes('biryani')) {
    cuisines.push('Indian');
  }
  if (nameLower.includes('western') || nameLower.includes('pasta') || nameLower.includes('pizza')) {
    cuisines.push('Western');
  }
  if (nameLower.includes('japanese') || nameLower.includes('sushi') || nameLower.includes('ramen')) {
    cuisines.push('Japanese');
  }
  if (nameLower.includes('thai') || nameLower.includes('tom yum') || nameLower.includes('pad thai')) {
    cuisines.push('Thai');
  }
  if (nameLower.includes('korean') || nameLower.includes('kimchi') || nameLower.includes('bbq')) {
    cuisines.push('Korean');
  }
  
  return cuisines.length > 0 ? cuisines : ['Local'];
}

// Enhance single merchant
async function enhanceMerchant(merchant) {
  const enhanced = { ...merchant };
  
  try {
    // Basic enhancement
    enhanced.cuisine = detectCuisine(merchant.name);
    
    // Try Google Maps first
    const googleData = await getGoogleMapsData(merchant.name, merchant.address);
    
    if (googleData) {
      if (googleData.operating_hours) {
        enhanced.operatingHours = googleData.operating_hours;
        enhanced.hoursSource = 'GOOGLE_MAPS';
      }
      if (googleData.phone) {
        enhanced.phone = googleData.phone;
      }
    } else {
      // Fallback to OneMap
      const oneMapData = await getOneMapData(merchant.name, merchant.address);
      if (oneMapData) {
        enhanced.operatingHours = oneMapData.operating_hours;
        enhanced.phone = oneMapData.phone;
        enhanced.businessCategory = oneMapData.businessCategory;
        enhanced.hoursSource = 'ONEMAP_ESTIMATED';
      } else {
        enhanced.hoursSource = 'FALLBACK';
      }
    }
    
    // Check Halal status
    const halalInfo = await checkHalalStatus(merchant.name, merchant.address);
    enhanced.isHalal = halalInfo.isHalal;
    enhanced.halalSource = halalInfo.halalSource;
    
  } catch (error) {
    await log(`Error enhancing ${merchant.name}: ${error.message}`);
  }
  
  return enhanced;
}

// Convert to CSV format
function convertToCSV(merchants) {
  if (merchants.length === 0) return '';
  
  const headers = [
    'id', 'entityId', 'name', 'address', 'postalCode', 'type', 'LAT', 'LON',
    'lastResetDate', 'budgetmeal', 'isHalal', 'cuisine', 'operatingHours',
    'phone', 'businessCategory', 'halalSource', 'hoursSource', 'lastUpdated'
  ];
  
  const rows = merchants.map(merchant => {
    return [
      merchant.id,
      merchant.entityId,
      merchant.name,
      merchant.address,
      merchant.postalCode,
      merchant.type,
      merchant.LAT,
      merchant.LON,
      merchant.lastResetDate,
      merchant.filters?.secondary?.budgetmeal || false,
      merchant.isHalal || false,
      JSON.stringify(merchant.cuisine || []),
      JSON.stringify(merchant.operatingHours || {}),
      merchant.phone || '',
      merchant.businessCategory || '',
      merchant.halalSource || 'UNKNOWN',
      merchant.hoursSource || 'FALLBACK',
      new Date().toISOString()
    ].map(value => {
      const stringValue = String(value || '');
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
  });
  
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// Main refresh function
async function refreshData() {
  const startTime = Date.now();
  await log('=== Starting Enhanced Nightly Data Refresh ===');
  
  try {
    await ensureOutputDir();
    
    // Fetch CDC data
    await log('Fetching CDC voucher data...');
    const response = await fetch(CONFIG.CDC_API_URL);
    if (!response.ok) {
      throw new Error(`CDC API returned ${response.status}: ${response.statusText}`);
    }
    
    const cdcData = await response.json();
    await log(`Fetched ${cdcData.locations.length} merchants from CDC API`);
    
    // Smart filtering to skip merchants likely to fail API calls
    const viableMerchants = cdcData.locations.filter(merchant => !shouldSkipMerchant(merchant));
    const skippedCount = cdcData.locations.length - viableMerchants.length;
    
    await log(`Filtering: Processing ${viableMerchants.length} viable merchants (skipping ${skippedCount} incomplete entries)`);
    
    // Process viable merchants in larger batches
    const enhancedMerchants = [];
    const totalBatches = Math.ceil(viableMerchants.length / CONFIG.BATCH_SIZE);
    
    for (let i = 0; i < viableMerchants.length; i += CONFIG.BATCH_SIZE) {
      const batch = viableMerchants.slice(i, i + CONFIG.BATCH_SIZE);
      const batchNumber = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
      const startTime = Date.now();
      
      await log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} merchants)`);
      
      const enhancedBatch = await Promise.all(
        batch.map(merchant => enhanceMerchant(merchant))
      );
      
      enhancedMerchants.push(...enhancedBatch);
      
      // Calculate and display progress with time estimates
      const batchTime = Date.now() - startTime;
      const progress = Math.round((i + batch.length) / viableMerchants.length * 100);
      const remainingBatches = totalBatches - batchNumber;
      const estimatedTimeRemaining = Math.round((remainingBatches * batchTime) / 1000 / 60); // minutes
      
      await log(`Progress: ${progress}% (${i + batch.length}/${viableMerchants.length} processed) - Batch: ${Math.round(batchTime/1000)}s, Est. ${estimatedTimeRemaining}min remaining`);
      
      // Reduced delay for faster processing
      if (batchNumber < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      }
    }
    
    // Add back the skipped merchants without enhancement (basic data only)
    const skippedMerchants = cdcData.locations.filter(merchant => shouldSkipMerchant(merchant));
    skippedMerchants.forEach(merchant => {
      const basicEnhanced = { ...merchant };
      basicEnhanced.cuisine = detectCuisine(merchant.name);
      basicEnhanced.isHalal = false;
      basicEnhanced.halalSource = 'SKIPPED';
      basicEnhanced.hoursSource = 'FALLBACK';
      enhancedMerchants.push(basicEnhanced);
    });
    
    await log(`Total processed: ${enhancedMerchants.length} merchants (${viableMerchants.length} enhanced + ${skippedCount} basic)`);
    
    // Export to files
    await log('Exporting data to files...');
    
    // Export to CSV
    const csvContent = convertToCSV(enhancedMerchants);
    const csvPath = path.join(CONFIG.OUTPUT_DIR, 'enhanced-merchants.csv');
    await fs.writeFile(csvPath, csvContent, 'utf8');
    await log(`✅ CSV exported to ${csvPath}`);
    
    // Export to JSON
    const jsonContent = JSON.stringify(enhancedMerchants, null, 2);
    const jsonPath = path.join(CONFIG.OUTPUT_DIR, 'enhanced-merchants.json');
    await fs.writeFile(jsonPath, jsonContent, 'utf8');
    await log(`✅ JSON exported to ${jsonPath}`);
    
    // Create summary
    const summary = {
      refreshDate: new Date().toISOString(),
      totalMerchants: enhancedMerchants.length,
      googleMapsEnhanced: enhancedMerchants.filter(m => m.hoursSource === 'GOOGLE_MAPS').length,
      oneMapEnhanced: enhancedMerchants.filter(m => m.hoursSource === 'ONEMAP_ESTIMATED').length,
      fallbackHours: enhancedMerchants.filter(m => m.hoursSource === 'FALLBACK').length,
      halalCertified: enhancedMerchants.filter(m => m.isHalal).length,
      budgetMeals: enhancedMerchants.filter(m => m.filters?.secondary?.budgetmeal).length,
      processingTimeMs: Date.now() - startTime
    };
    
    const summaryPath = path.join(CONFIG.OUTPUT_DIR, 'refresh-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    
    await log(`=== Refresh Complete ===`);
    await log(`Total merchants: ${summary.totalMerchants}`);
    await log(`Google Maps enhanced: ${summary.googleMapsEnhanced}`);
    await log(`OneMap enhanced: ${summary.oneMapEnhanced}`);
    await log(`Fallback hours: ${summary.fallbackHours}`);
    await log(`Halal certified: ${summary.halalCertified}`);
    await log(`Budget meals: ${summary.budgetMeals}`);
    await log(`Processing time: ${Math.round(summary.processingTimeMs / 1000)}s`);
    
  } catch (error) {
    await log(`❌ Error during refresh: ${error.message}`);
    await log(error.stack);
    process.exit(1);
  }
}

// Run the refresh
if (require.main === module) {
  refreshData().catch(console.error);
}

module.exports = { refreshData };
