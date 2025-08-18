// Proxy utility to handle CORS issues with CDC API - Real API only

export const fetchWithProxy = async (url: string) => {
  try {
    // Try direct fetch first
    console.log('Attempting direct fetch:', url);
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      console.log('Direct fetch successful:', data);
      return data;
    }
    throw new Error(`Direct fetch failed: ${response.status} ${response.statusText}`);
  } catch (error) {
    console.warn('Direct fetch failed, trying proxy methods...', error);
    
    // Fallback 1: Use allorigins proxy service
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      console.log('Trying allorigins proxy:', proxyUrl);
      const proxyResponse = await fetch(proxyUrl);
      if (proxyResponse.ok) {
        const proxyData = await proxyResponse.json();
        const data = JSON.parse(proxyData.contents);
        console.log('Proxy fetch successful:', data);
        return data;
      }
      throw new Error(`Proxy fetch failed: ${proxyResponse.status}`);
    } catch (proxyError) {
      console.warn('Allorigins proxy failed:', proxyError);
    }
    
    // Fallback 2: Use cors-anywhere proxy (requires activation)
    try {
      const corsProxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
      console.log('Trying cors-anywhere proxy:', corsProxyUrl);
      const corsResponse = await fetch(corsProxyUrl);
      if (corsResponse.ok) {
        const data = await corsResponse.json();
        console.log('CORS proxy fetch successful:', data);
        return data;
      }
      throw new Error(`CORS proxy fetch failed: ${corsResponse.status}`);
    } catch (corsError) {
      console.warn('CORS proxy failed:', corsError);
    }
    
    // Fallback 3: Try another public CORS proxy
    try {
      const jsonpProxyUrl = `https://jsonp.afeld.me/?url=${encodeURIComponent(url)}`;
      console.log('Trying jsonp proxy:', jsonpProxyUrl);
      const jsonpResponse = await fetch(jsonpProxyUrl);
      if (jsonpResponse.ok) {
        const data = await jsonpResponse.json();
        console.log('JSONP proxy fetch successful:', data);
        return data;
      }
      throw new Error(`JSONP proxy fetch failed: ${jsonpResponse.status}`);
    } catch (jsonpError) {
      console.warn('JSONP proxy failed:', jsonpError);
    }
    
    // If all real API attempts fail, return empty result
    console.error('All API attempts failed for:', url);
    console.error('This might be due to CORS restrictions or network issues.');
    console.error('Consider setting up a backend proxy or using the app from a deployed domain.');
    
    return {
      found: 0,
      totalNumPages: 0,
      pageNum: 1,
      results: [],
      error: 'API_UNAVAILABLE'
    };
  }
};
