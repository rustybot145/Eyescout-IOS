import * as WebBrowser from 'expo-web-browser';

// Both stores open these links during review, and Google Play additionally
// requires a reachable privacy policy URL in the Console listing.
//
// Apple's Standard EULA is NOT valid for a Google Play listing, so Terms points
// at EyeScout's own terms page for both platforms.
//
// The pages now exist in the website repo (eyescout-site/{terms,privacy,support}.html)
// and ship with the next site deploy.
//
// ⚠️ These are still 404 in production until that deploy happens. Verify all
// three return HTTP 200 before submitting to either store.
//
// The `.html` extension is deliberate: serve.mjs resolves a request path
// straight to a filename, and Vercel only strips extensions with
// `cleanUrls: true` (not set here). Extension-less URLs 404 on both.
export const TERMS_URL = 'https://eyescoutsports.com/terms.html';
export const PRIVACY_URL = 'https://eyescoutsports.com/privacy.html';
export const SUPPORT_URL = 'https://eyescoutsports.com/support.html';

export const openTerms = () => WebBrowser.openBrowserAsync(TERMS_URL);
export const openPrivacy = () => WebBrowser.openBrowserAsync(PRIVACY_URL);
export const openSupport = () => WebBrowser.openBrowserAsync(SUPPORT_URL);
