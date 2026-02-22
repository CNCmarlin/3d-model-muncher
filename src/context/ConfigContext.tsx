/**
 * Legacy ConfigContext.
 * Re-exports from AppConfigContext so existing imports continue to work.
 * When DB mode diverges, this can be replaced with a full independent copy.
 */
export { AppConfigProvider as ConfigProvider, useConfig } from './AppConfigContext';
export type { ConfigContextType } from './AppConfigContext';

