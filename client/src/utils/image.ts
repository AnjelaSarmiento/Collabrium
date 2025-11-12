/**
 * Builds the full URL for a user's profile picture.
 * Works for both uploaded files (local server) and external URLs (like Google).
 */
export function getProfileImageUrl(
    profilePicture?: string,
    serverBase: string = 'http://localhost:5000',
    forceRefresh: boolean = false
  ): string {
    if (!profilePicture) {
      return '';
    }
  
  // If already an absolute URL (e.g., Google photo)
  if (/^https?:\/\//i.test(profilePicture)) {
    try {
      const url = new URL(profilePicture);
      // Treat placeholder domains as "no image" so we can fall back to default
      if (url.hostname.includes('via.placeholder.com')) {
        return '';
      }
    } catch {
      // If URL parsing fails, fall through to default handling
    }
    return profilePicture + (forceRefresh ? `?t=${Date.now()}` : '');
  }
  
    // Normalize Windows or Unix-style paths to just the filename
    const filename = profilePicture.split(/[\\/]/).pop() || profilePicture;
  
    // Construct the final URL
    let url = `${serverBase}/uploads/profile-pictures/${filename}`;
  
    // Append cache-buster if requested
    if (forceRefresh) {
      url += `?t=${Date.now()}`;
    }
  
    return url;
  }
  
  /**
   * Convenience function to always get a fresh (non-cached) version of the image.
   * Use this right after profile updates.
   */
  export function getRefreshedProfileImageUrl(profilePicture?: string, serverBase?: string): string {
    return getProfileImageUrl(profilePicture, serverBase, true);
  }
  