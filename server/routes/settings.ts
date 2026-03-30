import { Router, Request, Response } from 'express';
import { loadSettings, saveSettings, updateSettings, getEffectiveSettings, maskSensitiveSettings } from '../services/settings-storage.js';

export function createSettingsRouter() {
  const router = Router();

  /**
   * GET /api/settings
   * Get current settings (masked sensitive values)
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const effectiveSettings = getEffectiveSettings();
      const maskedSettings = maskSensitiveSettings(effectiveSettings);
      res.json(maskedSettings);
    } catch (error: any) {
      console.error('[Settings] Error loading settings:', error);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  /**
   * GET /api/settings/status
   * Get configuration status (what's configured)
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const settings = getEffectiveSettings();
      res.json({
        hasAnthropicKey: !!settings.anthropicApiKey,
        hasDatabricks: !!(settings.databricks?.host && settings.databricks?.token),
        hasAWS: !!(settings.aws?.accessKeyId && settings.aws?.secretAccessKey),
        hasOAuth: !!(settings.oauth?.clientId && settings.oauth?.clientSecret),
        hasRedis: !!settings.cache?.redisHost,
        hasVectorDb: !!settings.vectorDb?.type,
        tier: getTier(settings),
      });
    } catch (error: any) {
      console.error('[Settings] Error checking status:', error);
      res.status(500).json({ error: 'Failed to check settings status' });
    }
  });

  /**
   * PUT /api/settings
   * Update settings (full or partial)
   */
  router.put('/', async (req: Request, res: Response) => {
    try {
      const newSettings = req.body;
      
      // Validate settings structure
      if (!newSettings || typeof newSettings !== 'object') {
        return res.status(400).json({ error: 'Invalid settings format' });
      }

      const updated = await updateSettings(newSettings);
      const masked = maskSensitiveSettings(updated);
      
      res.json({ 
        success: true, 
        message: 'Settings updated successfully',
        settings: masked,
      });
    } catch (error: any) {
      console.error('[Settings] Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  /**
   * POST /api/settings/test
   * Test connection with provided credentials
   */
  router.post('/test', async (req: Request, res: Response) => {
    const { type, config } = req.body;
    
    try {
      switch (type) {
        case 'anthropic':
          // Test Anthropic API key
          const apiKey = config.apiKey;
          if (!apiKey) {
            return res.status(400).json({ error: 'API key is required' });
          }
          // Simple validation - actual test would require making an API call
          const isValid = apiKey.startsWith('sk-ant-');
          return res.json({ success: isValid, message: isValid ? 'Valid API key format' : 'Invalid API key format' });

        case 'databricks':
          // Test Databricks connection
          if (!config.host || !config.token) {
            return res.status(400).json({ error: 'Databricks host and token are required' });
          }
          // In production, make actual API call to test connection
          return res.json({ success: true, message: 'Configuration format valid' });

        case 'aws':
          // Test AWS credentials
          if (!config.accessKeyId || !config.secretAccessKey) {
            return res.status(400).json({ error: 'AWS credentials are required' });
          }
          // In production, make actual AWS API call to test credentials
          return res.json({ success: true, message: 'Configuration format valid' });

        case 'redis':
          // Test Redis connection
          if (!config.host) {
            return res.status(400).json({ error: 'Redis host is required' });
          }
          // In production, try connecting to Redis
          return res.json({ success: true, message: 'Configuration format valid' });

        default:
          return res.status(400).json({ error: 'Unknown test type' });
      }
    } catch (error: any) {
      console.error('[Settings] Test error:', error);
      res.status(500).json({ error: error.message || 'Test failed' });
    }
  });

  /**
   * DELETE /api/settings
   * Reset settings to defaults (use environment variables only)
   */
  router.delete('/', async (_req: Request, res: Response) => {
    try {
      await saveSettings({});
      res.json({ success: true, message: 'Settings reset to environment variables' });
    } catch (error: any) {
      console.error('[Settings] Error resetting settings:', error);
      res.status(500).json({ error: 'Failed to reset settings' });
    }
  });

  return router;
}

/**
 * Determine operational tier based on configured services
 */
function getTier(settings: any): 'tier1' | 'tier2' | 'tier3' {
  const hasAI = !!settings.anthropicApiKey;
  const hasDB = !!(settings.databricks?.host && settings.databricks?.token);
  const hasAWS = !!(settings.aws?.accessKeyId && settings.aws?.secretAccessKey);

  if (hasAI && hasDB && hasAWS) return 'tier1'; // Full mode
  if (hasAI) return 'tier2'; // AI mode
  return 'tier3'; // Demo mode
}
