// Netlify function to proxy Matomo tracking requests (matomo.php)
// This forwards tracking data to Matomo from your domain to avoid adblockers

const MATOMO_TRACK_URL = 'https://noirlang.matomo.cloud/matomo.php';

// Simple rate limiting (similar to subscribe.js)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 tracking requests per minute per IP (generous for analytics)

function isRateLimited(ip) {
  const now = Date.now();
  const key = `track_${ip}`;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, {
      count: 1,
      firstRequest: now
    });
    return false;
  }
  
  const data = rateLimitMap.get(key);
  
  // Reset if window has passed
  if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, {
      count: 1,
      firstRequest: now
    });
    return false;
  }
  
  // Check if limit exceeded
  if (data.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  data.count++;
  return false;
}

// Clean up old entries
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW);

exports.handler = async (event, context) => {
  const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'] || 'unknown';
  
  // Rate limiting check
  if (isRateLimited(clientIP)) {
    console.warn('🚨 Rate limit exceeded for tracking:', clientIP);
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60'
      },
      body: JSON.stringify({
        error: 'Too many tracking requests'
      })
    };
  }

  try {
    // Handle both GET and POST requests (Matomo supports both)
    const method = event.httpMethod;
    let targetUrl = MATOMO_TRACK_URL;
    let body = null;
    
    // Preserve query parameters for GET requests
    if (method === 'GET' && event.queryStringParameters) {
      const params = new URLSearchParams(event.queryStringParameters);
      targetUrl = `${MATOMO_TRACK_URL}?${params.toString()}`;
    }
    
    // Preserve body for POST requests
    if (method === 'POST' && event.body) {
      body = event.body;
    }

    // Forward headers that Matomo needs
    const forwardHeaders = {
      'User-Agent': event.headers['user-agent'] || 'Aztec-Docs-Proxy/1.0',
      'Accept': event.headers['accept'] || '*/*',
      'Accept-Language': event.headers['accept-language'] || 'en-US,en;q=0.9',
      'Accept-Encoding': event.headers['accept-encoding'] || 'gzip, deflate',
      'Referer': event.headers['referer'] || event.headers['origin'] || '',
      'X-Forwarded-For': clientIP,
      'X-Real-IP': clientIP
    };

    // Add Content-Type for POST requests
    if (method === 'POST' && event.headers['content-type']) {
      forwardHeaders['Content-Type'] = event.headers['content-type'];
    }

    console.log(`📊 Proxying ${method} tracking request to Matomo for IP: ${clientIP}`);

    const response = await fetch(targetUrl, {
      method: method,
      headers: forwardHeaders,
      body: body
    });

    // Get response content
    let responseBody;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    console.log(`✅ Matomo response: ${response.status} ${response.statusText}`);

    // Return the response from Matomo
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': contentType || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Proxy-Source': 'netlify-matomo-proxy'
      },
      body: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
    };

  } catch (error) {
    console.error('💥 Error in Matomo tracking proxy:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Analytics tracking error',
        message: 'Proxy error'
      })
    };
  }
};