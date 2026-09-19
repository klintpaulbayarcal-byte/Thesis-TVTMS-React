/**
 * Runtime frontend configuration.
 *
 * Hostinger production serves the static pages and PHP /api from the same origin.
 * Database credentials remain server-side.
 */
window.APP_CONFIG = window.APP_CONFIG || {};
const defaultApiOrigin = '';
window.APP_CONFIG.API_ORIGIN = String(window.APP_CONFIG.API_ORIGIN || defaultApiOrigin).replace(/\/$/, '');
