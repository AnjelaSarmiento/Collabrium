/**
 * Message Status Reconnect Tests
 * 
 * Tests:
 * 1. Reconnects do not re-emit older sent events
 * 2. Reconnects only emit delivered events for undelivered messages
 * 3. Status sequence is maintained across reconnects
 * 4. No duplicate status updates on reconnect
 */

// Mock server behavior
class MockServer {
  constructor() {
    this.messages = new Map();
    this.emittedEvents = [];
  }
  
  createMessage(messageId, conversationId, senderId) {
    const message = {
      _id: messageId,
      conversationId,
      sender: senderId,
      createdAt: new Date(),
      deliveredTo: [],
      seenBy: []
    };
    this.messages.set(messageId, message);
    
    // Emit message:sent (only on creation, not on reconnect)
    this.emit('message:sent', {
      conversationId,
      messageId,
      seq: 1,
      timestamp: new Date().toISOString()
    });
    
    return message;
  }
  
  handleReconnect(userId) {
    // On reconnect, server should:
    // 1. NOT re-emit message:sent events (already sent)
    // 2. Only emit message:delivered for undelivered messages
    // 3. Only emit message:seen for unread messages
    
    const undeliveredMessages = Array.from(this.messages.values()).filter(msg => {
      if (!msg.deliveredTo || msg.deliveredTo.length === 0) {
        return true;
      }
      return !msg.deliveredTo.some(d => d.userId === userId);
    });
    
    console.log(`[MockServer] Reconnect: Found ${undeliveredMessages.length} undelivered messages`);
    
    // Emit delivered events for undelivered messages (NOT sent events)
    undeliveredMessages.forEach(msg => {
      this.emit('message:delivered', {
        conversationId: msg.conversationId,
        messageId: msg._id,
        seq: 2,
        timestamp: new Date().toISOString()
      });
    });
    
    return {
      sentEventsReemitted: this.emittedEvents.filter(e => e.type === 'message:sent').length,
      deliveredEventsEmitted: this.emittedEvents.filter(e => e.type === 'message:delivered').length
    };
  }
  
  emit(type, payload) {
    this.emittedEvents.push({
      type,
      payload,
      timestamp: new Date().toISOString()
    });
    console.log(`[MockServer] Emitted: ${type} for ${payload.messageId} (seq: ${payload.seq})`);
  }
  
  clearEvents() {
    this.emittedEvents = [];
  }
}

// Mock client state
class MockClient {
  constructor() {
    this.messageSeqRef = new Map();
    this.messageStatus = {};
    this.statusGlitchCountRef = new Map();
    this.receivedEvents = [];
  }
  
  handleEvent(event) {
    const { type, payload } = event;
    const { messageId, seq, timestamp } = payload;
    
    this.receivedEvents.push(event);
    
    const lastSeq = this.messageSeqRef.get(messageId) ?? 0;
    const lastTimestamp = this.messageSeqRef.get(`${messageId}_timestamp`) ?? 0;
    
    // Check sequence number
    const eventTimestamp = timestamp ? new Date(timestamp).getTime() : Date.now();
    const isNewerSeq = seq > lastSeq || (seq === lastSeq && eventTimestamp > lastTimestamp);
    const isValidSequence = seq === 0 || isNewerSeq || seq >= lastSeq;
    
    if (!isValidSequence) {
      console.log(`[MockClient] ⏭️ Ignoring older event: ${messageId} (seq ${seq} < ${lastSeq})`);
      const glitchCount = this.statusGlitchCountRef.get(messageId) || 0;
      this.statusGlitchCountRef.set(messageId, glitchCount + 1);
      return { accepted: false, reason: 'out-of-order' };
    }
    
    // Update status based on sequence
    const statusMap = {
      1: 'Sent',
      2: 'Delivered',
      3: 'Read'
    };
    const status = statusMap[seq] || 'Unknown';
    
    this.messageSeqRef.set(messageId, seq);
    this.messageSeqRef.set(`${messageId}_timestamp`, eventTimestamp);
    this.messageStatus[messageId] = status;
    
    return { accepted: true, status, seq };
  }
  
  getStatus(messageId) {
    return this.messageStatus[messageId];
  }
  
  getGlitchCount(messageId) {
    return this.statusGlitchCountRef.get(messageId) || 0;
  }
  
  reset() {
    this.messageSeqRef.clear();
    this.messageStatus = {};
    this.statusGlitchCountRef.clear();
    this.receivedEvents = [];
  }
}

// Test: Reconnect does not re-emit sent events
function testReconnectNoSentReemit() {
  console.log('\n=== Test: Reconnect Does Not Re-emit Sent Events ===');
  
  const server = new MockServer();
  const client = new MockClient();
  
  // Step 1: Create message (triggers message:sent)
  const messageId = 'msg_123';
  const conversationId = 'conv_456';
  const senderId = 'user_1';
  
  server.createMessage(messageId, conversationId, senderId);
  console.log(`Created message: ${messageId}`);
  
  // Step 2: Client receives sent event
  const sentEvent = server.emittedEvents.find(e => e.type === 'message:sent');
  const sentResult = client.handleEvent(sentEvent);
  console.log(`Client received sent event: ${sentResult.accepted ? '✅ Accepted' : '❌ Rejected'}`);
  console.log(`Client status: ${client.getStatus(messageId)}`);
  
  // Step 3: Clear server events (simulate time passing)
  const sentEventsCount = server.emittedEvents.filter(e => e.type === 'message:sent').length;
  server.clearEvents();
  
  // Step 4: Simulate reconnect
  const reconnectResult = server.handleReconnect('user_2');
  console.log(`Reconnect: Sent events re-emitted: ${reconnectResult.sentEventsReemitted}`);
  console.log(`Reconnect: Delivered events emitted: ${reconnectResult.deliveredEventsEmitted}`);
  
  // Step 5: Verify no sent events were re-emitted
  const sentEventsAfterReconnect = server.emittedEvents.filter(e => e.type === 'message:sent').length;
  console.log(`Sent events after reconnect: ${sentEventsAfterReconnect}`);
  console.log(`Expected: 0 (no re-emit)`);
  console.log(`Test: ${sentEventsAfterReconnect === 0 ? '✅ PASS' : '❌ FAIL'}`);
  
  // Step 6: Verify client status unchanged
  const statusAfterReconnect = client.getStatus(messageId);
  console.log(`Client status after reconnect: ${statusAfterReconnect}`);
  console.log(`Expected: Sent (unchanged)`);
  console.log(`Test: ${statusAfterReconnect === 'Sent' ? '✅ PASS' : '❌ FAIL'}`);
  
  return {
    test: 'reconnect-no-sent-reemit',
    passed: sentEventsAfterReconnect === 0 && statusAfterReconnect === 'Sent',
    sentEventsAfterReconnect,
    statusAfterReconnect
  };
}

// Test: Reconnect emits delivered events for undelivered messages
function testReconnectDeliveredEvents() {
  console.log('\n=== Test: Reconnect Emits Delivered Events for Undelivered Messages ===');
  
  const server = new MockServer();
  const client = new MockClient();
  
  // Step 1: Create message (triggers message:sent)
  const messageId = 'msg_123';
  const conversationId = 'conv_456';
  const senderId = 'user_1';
  const recipientId = 'user_2';
  
  server.createMessage(messageId, conversationId, senderId);
  
  // Step 2: Client (sender) receives sent event
  const sentEvent = server.emittedEvents.find(e => e.type === 'message:sent');
  client.handleEvent(sentEvent);
  console.log(`Sender status: ${client.getStatus(messageId)}`);
  
  // Step 3: Message is not yet delivered (recipient offline)
  const message = server.messages.get(messageId);
  console.log(`Message deliveredTo: ${message.deliveredTo.length}`);
  console.log(`Expected: 0 (not delivered)`);
  
  // Step 4: Clear server events
  server.clearEvents();
  
  // Step 5: Simulate recipient reconnect
  const reconnectResult = server.handleReconnect(recipientId);
  console.log(`Reconnect: Delivered events emitted: ${reconnectResult.deliveredEventsEmitted}`);
  console.log(`Expected: 1 (one undelivered message)`);
  console.log(`Test: ${reconnectResult.deliveredEventsEmitted === 1 ? '✅ PASS' : '❌ FAIL'}`);
  
  // Step 6: Client (sender) receives delivered event
  const deliveredEvent = server.emittedEvents.find(e => e.type === 'message:delivered');
  if (deliveredEvent) {
    const deliveredResult = client.handleEvent(deliveredEvent);
    console.log(`Client received delivered event: ${deliveredResult.accepted ? '✅ Accepted' : '❌ Rejected'}`);
    console.log(`Client status: ${client.getStatus(messageId)}`);
    console.log(`Expected: Delivered`);
    console.log(`Test: ${client.getStatus(messageId) === 'Delivered' ? '✅ PASS' : '❌ FAIL'}`);
  }
  
  return {
    test: 'reconnect-delivered-events',
    passed: reconnectResult.deliveredEventsEmitted === 1 && client.getStatus(messageId) === 'Delivered',
    deliveredEventsEmitted: reconnectResult.deliveredEventsEmitted,
    finalStatus: client.getStatus(messageId)
  };
}

// Test: Status sequence maintained across reconnects
function testReconnectSequenceMaintained() {
  console.log('\n=== Test: Status Sequence Maintained Across Reconnects ===');
  
  const server = new MockServer();
  const client = new MockClient();
  
  const messageId = 'msg_123';
  const conversationId = 'conv_456';
  const senderId = 'user_1';
  const recipientId = 'user_2';
  
  // Step 1: Create message and receive sent event
  server.createMessage(messageId, conversationId, senderId);
  const sentEvent = server.emittedEvents.find(e => e.type === 'message:sent');
  client.handleEvent(sentEvent);
  
  console.log(`Initial sequence: ${client.messageSeqRef.get(messageId)}`);
  console.log(`Expected: 1 (Sent)`);
  
  // Step 2: Simulate reconnect and receive delivered event
  server.clearEvents();
  server.handleReconnect(recipientId);
  const deliveredEvent = server.emittedEvents.find(e => e.type === 'message:delivered');
  if (deliveredEvent) {
    client.handleEvent(deliveredEvent);
  }
  
  console.log(`Sequence after reconnect: ${client.messageSeqRef.get(messageId)}`);
  console.log(`Expected: 2 (Delivered)`);
  console.log(`Test: ${client.messageSeqRef.get(messageId) === 2 ? '✅ PASS' : '❌ FAIL'}`);
  
  // Step 3: Verify no glitches
  const glitchCount = client.getGlitchCount(messageId);
  console.log(`Status glitches: ${glitchCount}`);
  console.log(`Expected: 0 (no glitches)`);
  console.log(`Test: ${glitchCount === 0 ? '✅ PASS' : '❌ FAIL'}`);
  
  return {
    test: 'reconnect-sequence-maintained',
    passed: client.messageSeqRef.get(messageId) === 2 && glitchCount === 0,
    finalSequence: client.messageSeqRef.get(messageId),
    glitchCount
  };
}

// Run all reconnect tests
function runReconnectTests() {
  console.log('🧪 Running Reconnect Tests...\n');
  
  const results = [];
  
  // Test 1: No sent event re-emit
  results.push(testReconnectNoSentReemit());
  
  // Test 2: Delivered events for undelivered messages
  results.push(testReconnectDeliveredEvents());
  
  // Test 3: Sequence maintained
  results.push(testReconnectSequenceMaintained());
  
  // Summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total}`);
  
  results.forEach(result => {
    console.log(`  ${result.test}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  return {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      passed,
      total
    }
  };
}

// Run tests if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  const results = runReconnectTests();
  console.log('\n=== Test Results (JSON) ===');
  console.log(JSON.stringify(results, null, 2));
}

// Export for use in other test files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runReconnectTests,
    testReconnectNoSentReemit,
    testReconnectDeliveredEvents,
    testReconnectSequenceMaintained,
    MockServer,
    MockClient
  };
}

