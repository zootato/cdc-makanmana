import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Filter, MapPin, Clock, Utensils, Loader2, AlertCircle, Navigation } from 'lucide-react';
import { Merchant } from './data/merchants';
import { DataManager } from './services/dataManager';
import { searchMerchants, filterMerchants, sortMerchants, getOperatingStatus, FilterOptions } from './utils/merchantUtils';
import { formatDistance } from './utils/locationUtils';
import { fetchWithProxy } from './utils/proxyUtils';
import './index.css';

function App() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [dataSource, setDataSource] = useState<'cache' | 'fresh'>('cache');
  const [refreshProgress, setRefreshProgress] = useState<{current: number, total: number} | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filteredMerchants, setFilteredMerchants] = useState<Merchant[]>([]);
  const [displayedMerchants, setDisplayedMerchants] = useState<Merchant[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showingCount, setShowingCount] = useState(50); // Initial display limit
  const [filters, setFilters] = useState<FilterOptions>({
    showHalalOnly: false,
    showOpenOnly: false,
    showBudgetMeals: false,
    category: 'all'
  });
  const [sortBy, setSortBy] = useState<'name' | 'distance' | 'status'>('distance');
  const [showFilters, setShowFilters] = useState(false);
  const [showLocationSection, setShowLocationSection] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch address suggestions using CDC's official API with CORS handling
  const fetchAddressSuggestions = useCallback(async (searchValue: string) => {
    const trimmedValue = searchValue.trim();
    
    // Trigger suggestions for any meaningful search (3+ characters) or postal codes
    if (trimmedValue.length >= 3) {
      try {
        console.log('Fetching suggestions for:', trimmedValue);
        // URL encode the search value (spaces become +)
        const encodedSearch = encodeURIComponent(trimmedValue).replace(/%20/g, '+');
        const url = `https://prd-tmp.api.gowhere.gov.sg/xgw/onemap/search?searchVal=${encodedSearch}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
        const data = await fetchWithProxy(url);
        
        console.log('API response:', data);
        
        if (data.found > 0) {
          const suggestions = data.results.slice(0, 5).map((result: any) => {
            // Format like the official site
            if (result.BUILDING && result.BUILDING !== 'NIL') {
              return result.ADDRESS;
            } else {
              return `${result.BLK_NO} ${result.ROAD_NAME} Singapore ${result.POSTAL}`;
            }
          });
          console.log('Setting suggestions:', suggestions);
          setAddressSuggestions(suggestions);
        } else {
          console.log('No results found');
          setAddressSuggestions([]);
        }
      } catch (error) {
        console.error('Error fetching address suggestions:', error);
        setAddressSuggestions([]);
      }
    } else {
      setAddressSuggestions([]);
    }
  }, []);

  // Load merchants on component mount
  useEffect(() => {
    const loadMerchants = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Check if we have valid cached data
        if (DataManager.hasValidCachedData()) {
          console.log('Loading from cache...');
          const cachedMerchants = DataManager.loadCachedMerchants();
          
          if (cachedMerchants.length > 0) {
            setMerchants(cachedMerchants);
            setFilteredMerchants(cachedMerchants);
            setDisplayedMerchants(cachedMerchants.slice(0, 50));
            setDataSource('cache');
            
            const cacheInfo = DataManager.getCacheInfo();
            setLastUpdated(cacheInfo.lastUpdate || 'Unknown');
            setLoading(false);
            return;
          }
        }
        
        // If no valid cache, load basic data quickly
        console.log('No valid cache found, loading basic data...');
        await loadBasicData();
        
      } catch (err) {
        setError('Failed to load merchant data. Please try again later.');
        console.error('Error loading merchants:', err);
        setLoading(false);
      }
    };

    const loadBasicData = async () => {
      try {
        // Import the basic functions
        const { fetchCDCMerchants, enhanceMerchantData } = await import('./data/merchants');
        
        setDataSource('fresh');
        const data = await fetchCDCMerchants();
        
        // Use basic enhancement only (fast keyword-based detection)
        const basicEnhanced = data.locations.map(enhanceMerchantData);
        
        setMerchants(basicEnhanced);
        setFilteredMerchants(basicEnhanced);
        setDisplayedMerchants(basicEnhanced.slice(0, 50));
        setLastUpdated(data.lastUpdated);
        setLoading(false);
        
        // Save basic enhanced data to cache
        DataManager.saveMerchantsToCache(basicEnhanced);
        
        console.log(`Loaded ${basicEnhanced.length} merchants with basic enhancement`);
        
      } catch (error) {
        console.error('Error loading basic data:', error);
        setError('Failed to load data. Please try again later.');
        setLoading(false);
      }
    };

    loadMerchants();
  }, []);

  // Debounce search term to avoid API calls on every keystroke
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      fetchAddressSuggestions(searchTerm);
    }, 300); // 300ms delay
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm, fetchAddressSuggestions]);

  // Handle search with async postal code lookup
  const performSearch = useCallback(async () => {
    setSearchLoading(true);
    
    // Use setTimeout to prevent UI blocking
    setTimeout(async () => {
      try {
        let result = await searchMerchants(merchants, debouncedSearchTerm);
        result = filterMerchants(result, filters);
        result = sortMerchants(result, sortBy);
        setFilteredMerchants(result);
        setDisplayedMerchants(result.slice(0, showingCount));
        setShowingCount(50); // Reset to 50 on new search
      } catch (error) {
        console.error('Search error:', error);
        // Fallback to basic filtering
        let result = filterMerchants(merchants, filters);
        result = sortMerchants(result, sortBy);
        setFilteredMerchants(result);
        setDisplayedMerchants(result.slice(0, 50));
      }
      setSearchLoading(false);
    }, 10); // Small delay to prevent UI blocking
  }, [merchants, debouncedSearchTerm, filters, sortBy, showingCount]);

  // Trigger search when dependencies change (but not on initial load)
  useEffect(() => {
    if (debouncedSearchTerm || Object.values(filters).some(v => v === true || (v !== 'all' && v !== false))) {
      performSearch();
    }
  }, [performSearch, debouncedSearchTerm, filters]);

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      showHalalOnly: false,
      showOpenOnly: false,
      showBudgetMeals: false,
      category: 'all'
    });
  };

  const activeFiltersCount = Object.values(filters).filter(v => 
    v === true || (v !== 'all' && v !== false)
  ).length;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Loading CDC Merchants</h2>
          {dataSource === 'cache' ? (
            <p className="text-gray-600">Loading cached data...</p>
          ) : (
            <p className="text-gray-600">Loading latest CDC voucher data...</p>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-600" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #4a56a3 0%, #3e4b9a 100%)' }}>
      {/* Top Navigation */}
      <nav className="bg-red-600 text-white px-4 py-2 text-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span>Read this in:</span>
            <span className="underline">English</span>
            <span>|</span>
            <span>中文</span>
            <span>|</span>
            <span>Melayu</span>
            <span>|</span>
            <span>தமிழ்</span>
          </div>
          <button className="bg-red-700 px-3 py-1 rounded">FAQ</button>
        </div>
      </nav>

      {/* Main Navigation */}
      <nav className="bg-blue-900 text-white px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center space-x-6">
          <button className="bg-red-600 px-4 py-2 rounded-full font-medium">Home</button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="text-center py-12 text-white">
        <div className="max-w-4xl mx-auto px-4">
          {/* CDC Voucher Banner */}
          <div className="mb-8 flex justify-center">
            <img 
              src="/cdcc_banner_may.png" 
              alt="CDC Voucher" 
              className="h-24 w-auto"
            />
          </div>

          <h1 className="text-3xl font-bold mb-4">Where to spend CDC vouchers?</h1>
          <p className="text-lg mb-2 italic">SG60 Vouchers can be used wherever CDC Vouchers are accepted</p>
          
          <p className="text-base mb-8 max-w-2xl mx-auto">
            Enter name of stall, street name or postal code to search for the nearest participating hawkers, heartland merchants and supermarkets.
          </p>

          {/* Enhanced Search Section */}
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Main Search Bar */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden border-2 border-blue-300">
              <div className="flex">
                <input
                  type="text"
                  placeholder="Enter name of stall, street name or postal code"
                  className="flex-1 px-4 py-3 text-gray-900 border-0 focus:ring-0 focus:outline-none text-base"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setShowLocationSection(true)}
                  onBlur={() => {
                    // Delay hiding to allow clicking on suggestions
                    setTimeout(() => {
                      setShowLocationSection(false);
                      setAddressSuggestions([]);
                    }, 150);
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setAddressSuggestions([]);
                    }}
                    className="px-3 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <span className="text-xl">×</span>
                  </button>
                )}
                <button className="bg-red-600 hover:bg-red-700 px-6 flex items-center justify-center transition-colors">
                  <Search className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Address Suggestions - Show when typing postal code */}
            {addressSuggestions.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                <div className="p-3 bg-gray-50 border-b">
                  <span className="text-sm font-medium text-gray-700 uppercase">AREA/ADDRESS</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {addressSuggestions.map((address, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setSearchTerm(address);
                        setAddressSuggestions([]);
                        setShowLocationSection(false);
                      }}
                      className="w-full text-left p-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 flex items-center transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-blue-600 mr-3 flex-shrink-0" />
                      <span className="text-gray-800">{address}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Debug: Show if we're trying to fetch but no results */}
            {/^\d{6}$/.test(searchTerm.trim()) && addressSuggestions.length === 0 && (
              <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                <div className="p-3 bg-gray-50 border-b">
                  <span className="text-sm font-medium text-gray-700 uppercase">AREA/ADDRESS</span>
                </div>
                <div className="p-3 text-gray-500 text-sm">
                  <div className="flex items-center">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Searching for addresses...
                  </div>
                </div>
              </div>
            )}

            {/* Location Section - Only show when search is focused and no meaningful search text */}
            {showLocationSection && addressSuggestions.length === 0 && searchTerm.trim().length < 3 && (
              <div className="bg-gray-100 rounded-lg shadow-lg overflow-hidden">
                <div className="p-4 bg-gray-200 border-b">
                  <div className="flex items-center text-gray-700">
                    <Navigation className="w-5 h-5 mr-2 text-blue-600" />
                    <span className="font-medium">Your location</span>
                  </div>
                </div>
                
                <div className="p-4">
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex-shrink-0 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">!</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 mb-1">We're unable to retrieve your location</p>
                      <p className="text-sm text-gray-600">Please allow location services and try again.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {searchLoading && (
              <div className="flex items-center justify-center text-white">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Searching...
              </div>
            )}

            {/* Search tip */}
            {/^\d{1,6}$/.test(searchTerm) && (
              <div className="p-3 bg-blue-800 bg-opacity-50 rounded-lg border border-blue-300">
                <div className="flex items-center text-sm text-blue-100">
                  <Navigation className="w-4 h-4 mr-2" />
                  {searchTerm.length === 6 
                    ? "Searching by location - showing nearest merchants within 10km"
                    : "Enter 6-digit postal code for location-based search"
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="bg-gray-100 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Updated info and filters */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              Updated as of {new Date(lastUpdated).toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              })}
            </p>

            {/* Top Filter Row - Main Categories */}
            <div className="flex flex-wrap gap-3 mb-4">
              <button
                onClick={() => handleFilterChange('showBudgetMeals', !filters.showBudgetMeals)}
                className={`px-4 py-2 rounded-full border-2 font-medium transition-colors ${
                  filters.showBudgetMeals
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-600 hover:bg-red-50'
                }`}
              >
                Budget Meals
              </button>

              <button
                onClick={() => handleFilterChange('category', filters.category === 'hawker' ? 'all' : 'hawker')}
                className={`px-4 py-2 rounded-full border-2 font-medium transition-colors ${
                  filters.category === 'hawker'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-600 hover:bg-red-50'
                }`}
              >
                Hawkers & Heartland Merchants
              </button>

              <button
                onClick={() => handleFilterChange('category', filters.category === 'supermarket' ? 'all' : 'supermarket')}
                className={`px-4 py-2 rounded-full border-2 font-medium transition-colors ${
                  filters.category === 'supermarket'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-600 hover:bg-red-50'
                }`}
              >
                Supermarkets
              </button>
            </div>

            {/* Second Filter Row - Additional Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={() => handleFilterChange('showHalalOnly', !filters.showHalalOnly)}
                className={`px-4 py-2 rounded-full border-2 font-medium transition-colors inline-flex items-center gap-2 ${
                  filters.showHalalOnly
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-600 hover:bg-red-50'
                }`}
              >
                <img src="/Halal-Logo.avif" alt="Halal" className="w-4 h-4" />
                Halal
              </button>
              
              <button
                onClick={() => handleFilterChange('showOpenOnly', !filters.showOpenOnly)}
                className={`px-4 py-2 rounded-full border-2 font-medium transition-colors ${
                  filters.showOpenOnly
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-600 hover:bg-red-50'
                }`}
              >
                🟢 Open Now
              </button>

              {activeFiltersCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 font-medium"
                >
                  Clear All ({activeFiltersCount})
                </button>
              )}
            </div>

            {/* Results count */}
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Showing {displayedMerchants.length} result(s) {searchTerm && `near '${searchTerm}'`}
              <span className="text-sm font-normal text-gray-600 ml-2">
                ({filteredMerchants.length} total found)
              </span>
            </h2>
          </div>

          {/* Results */}
          <div className="space-y-4">
          {filteredMerchants.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No merchants found</h3>
              <p className="text-gray-500">Try adjusting your search or filters</p>
            </div>
          ) : (
            <>
              {displayedMerchants.map((merchant) => (
                <MerchantCard key={merchant.id} merchant={merchant} />
              ))}
              
              {/* Load More Button */}
              {displayedMerchants.length < filteredMerchants.length && (
                <div className="text-center py-6">
                  <button
                    onClick={() => {
                      const newCount = showingCount + 50;
                      setShowingCount(newCount);
                      setDisplayedMerchants(filteredMerchants.slice(0, newCount));
                    }}
                    className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 transition-colors"
                  >
                    Load More ({filteredMerchants.length - displayedMerchants.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MerchantCardProps {
  merchant: Merchant;
}

function MerchantCard({ merchant }: MerchantCardProps) {
  const status = getOperatingStatus(merchant);

  return (
    <div className="bg-white rounded-lg border border-gray-200 mb-4">
      {/* Category Header */}
      <div className="flex justify-between items-start p-3">
        <div className="flex flex-wrap gap-2">
          <div className="px-3 py-1 bg-teal-400 text-black text-sm font-medium uppercase tracking-wide rounded">
            {merchant.type === 'HAWKER_HEARTLAND_MERCHANT' ? 'HAWKERS & HEARTLAND MERCHANTS' : 'SUPERMARKET'}
          </div>
          {merchant.filters?.secondary?.budgetmeal && (
            <div className="px-3 py-1 bg-orange-500 text-black text-sm font-medium uppercase tracking-wide rounded">
              BUDGET MEALS
            </div>
          )}
        </div>
        
        {/* Status Badge - Top Right */}
        <div className="flex gap-2">
          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
            status.isOpen 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {status.isOpen ? '🟢 Open' : '🔴 Closed'}
          </span>
          {merchant.operatingHours && (
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white">
              {merchant.hoursSource === 'GOOGLE_MAPS' ? '🗺️ Google Hours' : 
               merchant.hoursSource === 'ONEMAP_ESTIMATED' ? '📍 OneMap Hours' : 
               '⏰ Real Hours'}
            </span>
          )}
        </div>
      </div>
      
      <div className="p-6">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-gray-900 uppercase">
              {merchant.name}
            </h3>
            {merchant.isHalal && (
              <img src="/Halal-Logo.avif" alt="Halal" className="w-5 h-5" />
            )}
          </div>
          {merchant.distance && (
            <span className="text-sm text-gray-600 font-medium">
              ({formatDistance(merchant.distance)} away)
            </span>
          )}
        </div>

        <div className="flex items-start mb-4">
          <MapPin className="w-4 h-4 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-700">
            <a 
              href={`https://www.onemap.gov.sg/amm/amm.html?mapStyle=Default&zoomLevel=15&marker=latLng:${merchant.LAT},${merchant.LON}!icon:fa-home!colour:darkblue&PopupWidth=200`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline cursor-pointer"
            >
              {merchant.address}
            </a>
          </div>
        </div>



        {status.nextChange && (
          <div className="text-xs text-gray-500 italic">
            {status.nextChange}
          </div>
        )}


      </div>
    </div>
  );
}

export default App;
