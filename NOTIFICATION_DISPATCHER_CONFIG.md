# Notification Dispatcher Configuration

## Overview

The unified NotificationDispatcher buffers and coalesces all notification and status events before dispatching them to UI surfaces. This prevents flicker and redundant updates.

## Configuration

### Buffer Delay

The buffer delay controls how long events are buffered before dispatch. Default: **300ms** (tunable 200-500ms).

#### Option 1: Environment Variable (Build Time)

Set `REACT_APP_NOTIFICATION_BUFFER_DELAY_MS` in your `.env` file:

```bash
REACT_APP_NOTIFICATION_BUFFER_DELAY_MS=300
```

Then in your code, set it on window before the app loads:

```javascript
// In index.html or before App renders
window.__BUFFER_DELAY_MS = parseInt(process.env.REACT_APP_NOTIFICATION_BUFFER_DELAY_MS || '300', 10);
```

#### Option 2: LocalStorage (Runtime)

Set via browser console or feature flag:

```javascript
localStorage.setItem('notification_buffer_delay_ms', '300');
// Reload page for changes to take effect
```

#### Option 3: Feature Flag System

If you have a feature flag system, you can set it dynamically:

```javascript
// In your feature flag system
const bufferDelay = getFeatureFlag('notification_buffer_delay_ms') || 300;
window.__BUFFER_DELAY_MS = bufferDelay;
```

## Metrics

The dispatcher tracks metrics that can be accessed via:

```javascript
// In browser console
window.__notificationDispatcher.getMetrics()
```

Metrics include:
- `totalEvents`: Total events processed
- `duplicateEvents`: Number of duplicate events filtered
- `highPriorityEvents`: Number of high-priority events (bypassed buffer)
- `averageDispatchLatency`: Average dispatch latency in ms
- `duplicateRate`: Percentage of duplicate events
- `bufferDelay`: Current buffer delay setting

## High-Priority Events

High-priority events bypass the buffer and are dispatched immediately. Currently, "Read" status updates are high-priority.

To add more high-priority event types, update `HIGH_PRIORITY_EVENT_TYPES` in `NotificationDispatcher.ts`:

```typescript
const HIGH_PRIORITY_EVENT_TYPES: NotificationEventType[] = [
  'call:incoming',
  'critical:alert',
  // Add more as needed
];
```

Or set `priority: 'high'` when dispatching:

```typescript
notificationDispatcher.dispatch({
  type: 'message:seen',
  payload: {...},
  priority: 'high', // Bypasses buffer
  timestamp: Date.now(),
});
```

## Architecture

1. **Event Sources**: Socket events, status updates, count updates
2. **Dispatcher**: Buffers, coalesces, and deduplicates events
3. **Subscribers**: Components subscribe to dispatched updates
4. **UI Updates**: All UI surfaces update together within the buffer window

## Benefits

- **No Flicker**: Rapid status changes are coalesced
- **Unified Updates**: All UI surfaces update together
- **Deduplication**: Duplicate events are filtered
- **Configurable**: Buffer delay can be tuned (200-500ms)
- **Metrics**: Track dispatch latency and duplicate rates
- **High-Priority**: Critical events bypass buffer

## Acceptance Criteria

✅ UI should not visibly flicker through multiple statuses
✅ Users should only see the final, meaningful status
✅ Related surfaces should update together within the delay window
✅ Metrics are available for monitoring
✅ Buffer delay is configurable (200-500ms)

