// Netlify function to proxy Matomo script (matomo.js)
// This serves the Matomo tracking script from your domain to avoid adblockers

const MATOMO_SCRIPT_URL = 'https://noirlang.matomo.cloud/matomo.js';

// Simple in-memory cache (resets on cold starts)
let scriptCache = {
  content: null,
  lastFetched: 0,
  maxAge: 60 * 60 * 1000 // 1 hour cache
};

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Allow': 'GET',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const now = Date.now();
    
    // Check if we have cached content that's still fresh
    if (scriptCache.content && (now - scriptCache.lastFetched) < scriptCache.maxAge) {
      console.log('📦 Serving cached Matomo script');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=3600', // 1 hour browser cache
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: scriptCache.content
      };
    }

    // Fetch fresh script from Matomo
    console.log('🔄 Fetching fresh Matomo script from:', MATOMO_SCRIPT_URL);
    
    const response = await fetch(MATOMO_SCRIPT_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Aztec-Docs-Proxy/1.0',
        'Accept': 'application/javascript, text/javascript, */*'
      }
    });

    if (!response.ok) {
      console.error('❌ Failed to fetch Matomo script:', response.status, response.statusText);
      return {
        statusCode: 502,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Failed to fetch analytics script',
          status: response.status
        })
      };
    }

    const scriptContent = await response.text();
    
    // Update cache
    scriptCache = {
      content: scriptContent,
      lastFetched: now,
      maxAge: scriptCache.maxAge
    };

    console.log('✅ Successfully proxied Matomo script, size:', scriptContent.length, 'bytes');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600', // 1 hour browser cache
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'X-Proxy-Source': 'netlify-matomo-proxy'
      },
      body: scriptContent
    };

  } catch (error) {
    console.error('💥 Error in Matomo script proxy:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Analytics proxy error'
      })
    };
  }
};