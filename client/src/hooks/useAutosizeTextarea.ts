import { useEffect, useRef } from 'react';

interface UseAutosizeTextareaOptions {
  minRows?: number;
  maxRows?: number;
  maxHeight?: number;
}

/**
 * Hook for auto-sizing textarea that expands as user types
 * @param value - The textarea value
 * @param options - Configuration options
 * @returns Ref to attach to textarea element
 */
export const useAutosizeTextarea = (
  value: string,
  options: UseAutosizeTextareaOptions = {}
) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    minRows = 1,
    maxRows = 6,
    maxHeight = 160, // ~6 lines at ~26px per line
  } = options;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate line height (use computed style or default)
    const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 24;
    const minHeight = minRows * lineHeight;
    const calculatedMaxHeight = maxRows * lineHeight;
    const actualMaxHeight = maxHeight || calculatedMaxHeight;

    // Calculate new height based on scrollHeight
    const scrollHeight = textarea.scrollHeight;
    let newHeight = Math.max(minHeight, scrollHeight);
    
    // Cap at max height
    if (newHeight > actualMaxHeight) {
      newHeight = actualMaxHeight;
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }

    textarea.style.height = `${newHeight}px`;
  }, [value, minRows, maxRows, maxHeight]);

  return textareaRef;
};

