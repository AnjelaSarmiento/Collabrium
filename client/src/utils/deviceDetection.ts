/**
 * Detects if the current device is a mobile device (phone or tablet)
 * @returns true if mobile, false if desktop
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check for touch support (primary indicator)
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Check user agent for mobile patterns
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  const isMobileUserAgent = mobileRegex.test(userAgent.toLowerCase());
  
  // Check screen width (mobile devices typically < 768px)
  const isSmallScreen = window.innerWidth < 768;
  
  // Consider it mobile if:
  // 1. Has touch screen AND (mobile user agent OR small screen)
  // 2. OR just mobile user agent (for tablets in desktop mode)
  return (hasTouchScreen && (isMobileUserAgent || isSmallScreen)) || isMobileUserAgent;
};

/**
 * Detects if the current device is a tablet
 * @returns true if tablet, false otherwise
 */
export const isTabletDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const tabletRegex = /ipad|android(?!.*mobile)|tablet/i;
  return tabletRegex.test(userAgent.toLowerCase());
};

