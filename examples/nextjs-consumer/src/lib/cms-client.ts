import { createBrewClient } from '@brew-cms/client';

const brewUrl = process.env.BREW_CMS_URL || 'http://localhost:3000';
const brewApiKey = process.env.BREW_CMS_API_KEY;

export const brew = createBrewClient({
  baseUrl: brewUrl,
  apiKey: brewApiKey,
  defaultRevalidate: 60, // Incremental Static Regeneration cache window
});
