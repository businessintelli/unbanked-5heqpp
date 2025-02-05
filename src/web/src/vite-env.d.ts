/// <reference types="vite/client" />

// Environment variable type definitions for the Unbanked platform
interface ImportMetaEnv {
  /** API endpoint URL for backend services */
  readonly VITE_API_URL: string;
  
  /** WebSocket endpoint URL for real-time updates */
  readonly VITE_WS_URL: string;
  
  /** Plaid API client ID for banking integration */
  readonly VITE_PLAID_CLIENT_ID: string;
  
  /** Plaid environment setting */
  readonly VITE_PLAID_ENV: 'sandbox' | 'development' | 'production';
  
  /** Supabase project URL */
  readonly VITE_SUPABASE_URL: string;
  
  /** Supabase anonymous API key */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

// Augment the ImportMeta interface
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Static asset type declarations
declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

declare module '*.webp' {
  const content: string;
  export default content;
}

declare module '*.avif' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

// Font asset type declarations
declare module '*.woff' {
  const content: string;
  export default content;
}

declare module '*.woff2' {
  const content: string;
  export default content;
}

declare module '*.eot' {
  const content: string;
  export default content;
}

declare module '*.ttf' {
  const content: string;
  export default content;
}

declare module '*.otf' {
  const content: string;
  export default content;
}

// Style module type declarations
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.sass' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*.less' {
  const content: { [className: string]: string };
  export default content;
}

// Data file type declarations
declare module '*.json' {
  const content: any;
  export default content;
}

declare module '*.yaml' {
  const content: any;
  export default content;
}

declare module '*.yml' {
  const content: any;
  export default content;
}