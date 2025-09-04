# 📊 Analytics Integration Guide

This document describes the improved analytics setup for Aztec Docs, including NPS tracking and Matomo integration.

## 🎯 Overview

The analytics system provides:
- **Type-safe Matomo integration** with proper TypeScript definitions
- **Comprehensive NPS tracking** with detailed event categorization  
- **Fallback handling** when analytics is unavailable or consent is pending
- **Development-friendly logging** with detailed console output
- **Automatic consent management** with retroactive event syncing

## 🔧 Architecture

### Core Components

1. **`src/utils/analytics.ts`** - Main analytics manager with type-safe Matomo integration
2. **`src/types/global.d.ts`** - TypeScript definitions for global objects
3. **`src/components/NPSWidget/`** - Enhanced NPS widget with comprehensive tracking
4. **`src/components/Matomo/matomo.jsx`** - Consent management with event syncing

### Key Features

- ✅ **Consent-aware**: Respects user privacy preferences
- ✅ **Fallback storage**: Queues events when analytics unavailable  
- ✅ **Development logging**: Rich console output for debugging
- ✅ **TypeScript support**: Full type safety for all analytics calls
- ✅ **Event categorization**: Detailed NPS analysis (promoters/passives/detractors)

## 📈 NPS Tracking Details

### Events Tracked

1. **NPS Response** (`trackNPSResponse`)
   - Main score submission with category classification
   - Feedback text (when provided) 
   - Custom dimensions for advanced analysis
   - Goal tracking for promoters (score 9-10)

2. **Widget Interactions** (`trackNPSWidgetEvent`)
   - Widget shown with context (page views, time on site, scroll %)
   - Widget dismissed with completion status
   - Widget timeout events

### Matomo Event Structure

```javascript
// Main NPS score event
['trackEvent', 'NPS Survey', 'Score Submitted', 'Score 8 (passive)', 8]

// Category classification  
['trackEvent', 'NPS Category', 'Passive', '/developers/getting-started', 8]

// Feedback tracking
['trackEvent', 'NPS Feedback', 'Feedback Provided', 'passive - Great docs but...', 45]

// Custom variables for segmentation
['setCustomVariable', 1, 'NPS Score', '8', 'page']
['setCustomVariable', 2, 'NPS Category', 'passive', 'page']
```

## 🛠 Usage Examples

### Basic NPS Tracking

```typescript
import { analytics } from '@site/src/utils/analytics';

// Track NPS response
analytics.trackNPSResponse({
  score: 9,
  feedback: "Great documentation, very helpful!",
  url: window.location.href,
  timestamp: Date.now(),
  userAgent: navigator.userAgent
});

// Track widget events
analytics.trackNPSWidgetEvent('shown', {
  pageViews: 3,
  timeOnSite: 120,
  scrollPercentage: 60
});
```

### Development Console Output

When `enableConsoleLogging: true` (default), you'll see:

```
📊 NPS Response Tracked
┌─────────────────┬───────────────────────────────────┐
│     (index)     │               Values              │
├─────────────────┼───────────────────────────────────┤
│      Score      │                 9                 │
│    Category     │             'promoter'            │
│  Has Feedback   │               true                │
│       URL       │  '/developers/getting-started'    │
│   Timestamp     │    '2025-01-15T10:30:00.000Z'     │
└─────────────────┴───────────────────────────────────┘
💬 Feedback: Great documentation, very helpful!

📋 NPS Widget: shown {pageViews: 3, timeOnSite: 120, scrollPercentage: 60}
```

## 🔄 Consent & Fallback System

### How It Works

1. **Before Consent**: Events stored in `localStorage` under `analytics_fallback`
2. **After Consent**: All queued events automatically sent to Matomo
3. **Storage Cleanup**: Fallback queue cleared after successful sync
4. **Capacity**: Max 50 events stored to prevent storage bloat

### Manual Sync

```typescript
// Force sync fallback events (happens automatically on consent)
analytics.syncFallbackEvents();
```

## 🎛 Configuration

### Analytics Manager Options

```typescript
import { AnalyticsManager } from '@site/src/utils/analytics';

const customAnalytics = new AnalyticsManager({
  enableConsoleLogging: false,  // Disable development logging
  enableMatomo: true,           // Enable Matomo integration  
  requireConsent: false         // Skip consent requirement
});
```

### Environment Variables

The system uses existing Matomo environment configuration:

```javascript
// From docusaurus.config.js
customFields: {
  MATOMO_ENV: process.env.ENV, // 'dev' | 'staging' | 'prod'
}
```

## 🐛 Debugging

### Check Analytics Status

```javascript
// In browser console
console.log('Matomo available:', typeof window._paq !== 'undefined');
console.log('Consent given:', localStorage.getItem("matomoConsent"));
console.log('Fallback events:', JSON.parse(localStorage.getItem('analytics_fallback') || '[]'));
```

### Force Event Sync

```javascript
// In browser console  
if (window.analytics) {
  window.analytics.syncFallbackEvents();
}
```

## 📊 Matomo Dashboard Setup

### Recommended Goals

1. **Goal 1**: NPS Promoter Response (triggered on score 9-10)
2. **Goal 2**: NPS Feedback Completion (any score with feedback)

### Custom Dimensions

1. **Dimension 1**: NPS Score (1-10)
2. **Dimension 2**: NPS Category (promoter/passive/detractor)

### Useful Segments

- **Promoters**: Custom Variable 2 equals 'promoter'
- **Detractors**: Custom Variable 2 equals 'detractor'  
- **Feedback Providers**: Event Action contains 'Feedback Provided'

## 🔄 Migration Notes

### From Previous Setup

The old NPS implementation used basic `_paq.push()` calls. The new system:

✅ **Improves**: Type safety, consent handling, fallback storage  
✅ **Adds**: Detailed categorization, development logging, automatic syncing  
✅ **Maintains**: All existing event data (backward compatible)

### Required Changes

No breaking changes - the new system works alongside existing Matomo setup.

---

## 🤝 Contributing

When adding new analytics events:

1. Use the `analytics` instance from `@site/src/utils/analytics`
2. Follow the existing event naming conventions  
3. Add TypeScript types for new event data structures
4. Test with console logging enabled in development
5. Verify events appear in Matomo dashboard

For questions or improvements, see the analytics utility code in `src/utils/analytics.ts`.