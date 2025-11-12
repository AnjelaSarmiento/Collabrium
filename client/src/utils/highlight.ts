/**
 * Lightweight utility for highlighting elements when navigating from notifications
 */

/**
 * Highlights an element with a subtle background color that fades out
 * @param elementId - ID of the element to highlight
 * @param duration - Duration of highlight in milliseconds (default: 2000)
 */
export function highlightElement(elementId: string, duration: number = 2000): void {
  const element = document.getElementById(elementId);
  if (!element) {
    // Retry after a short delay for dynamically loaded content
    setTimeout(() => {
      const retryElement = document.getElementById(elementId);
      if (retryElement) {
        applyHighlight(retryElement, duration);
        scrollIntoView(retryElement);
      }
    }, 300);
    return;
  }

  applyHighlight(element, duration);
  scrollIntoView(element);
}

/**
 * Applies highlight with a simple fade-out animation
 */
function applyHighlight(element: HTMLElement, duration: number): void {
  // Add highlight class
  element.classList.add('highlight-notification');
  
  // Remove highlight after duration
  setTimeout(() => {
    element.classList.remove('highlight-notification');
  }, duration);
}

/**
 * Smoothly scrolls element into view
 */
function scrollIntoView(element: HTMLElement): void {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });
}

/**
 * Highlights a message by conversation ID and optional message ID
 */
export function highlightMessage(conversationId: string, messageId?: string): void {
  if (messageId) {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      applyHighlight(messageElement, 2000);
      scrollIntoView(messageElement);
      return;
    }
  }

  // Otherwise highlight conversation
  const conversationElement = document.getElementById(`conversation-${conversationId}`);
  if (conversationElement) {
    applyHighlight(conversationElement, 2000);
    scrollIntoView(conversationElement);
  }
}

/**
 * Highlights a post, comment, or reply
 * Uses retry logic to handle dynamically loaded content
 */
export function highlightPost(postId: string, commentId?: string, replyId?: string): void {
  // Priority: reply > comment > post
  
  // Helper function to highlight a comment
  const highlightComment = (cid: string, retries = 10, delay = 200): void => {
    const commentElement = document.getElementById(`comment-${cid}`);
    if (commentElement) {
      applyHighlight(commentElement, 2000);
      scrollIntoView(commentElement);
      return;
    }
    if (retries > 0) {
      setTimeout(() => highlightComment(cid, retries - 1, delay * 1.2), delay);
    } else {
      console.warn(`[highlightPost] Comment element not found: comment-${cid}`);
      // Fall back to post only if comment truly doesn't exist
      highlightPostFallback(postId);
    }
  };

  // Helper function to highlight a reply
  const highlightReply = (rid: string, retries = 10, delay = 200): void => {
    const replyElement = document.getElementById(`reply-${rid}`);
    if (replyElement) {
      applyHighlight(replyElement, 2000);
      scrollIntoView(replyElement);
      return;
    }
    if (retries > 0) {
      setTimeout(() => highlightReply(rid, retries - 1, delay * 1.2), delay);
    } else {
      console.warn(`[highlightPost] Reply element not found: reply-${rid}`);
      // Fall through to comment or post
      if (commentId) {
        highlightComment(commentId);
      } else {
        highlightPostFallback(postId);
      }
    }
  };

  // Try to highlight reply first
  if (replyId) {
    highlightReply(replyId);
    return;
  }

  // Then try to highlight comment
  if (commentId) {
    highlightComment(commentId);
    return;
  }

  // Finally, highlight post itself
  highlightPostFallback(postId);
}

/**
 * Helper function to highlight the post itself
 */
function highlightPostFallback(postId: string): void {
  const postElement = document.getElementById(`post-${postId}`);
  if (postElement) {
    applyHighlight(postElement, 2000);
    scrollIntoView(postElement);
  } else {
    console.warn(`[highlightPost] Post element not found: post-${postId}`);
  }
}

