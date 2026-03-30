import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChatRouter } from './routes/chat.js';
import { createAuthRouter } from './routes/auth.js';
import { createSettingsRouter } from './routes/settings.js';
import { requireAdmin } from './middleware/admin-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Session configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'dataprism-dev-secret-change-in-production';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true, // Allow cookies
}));

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION, // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
  },
}));

// API routes
app.use('/api/auth', createAuthRouter());
app.use('/api/settings', requireAdmin, createSettingsRouter());
app.use('/api', createChatRouter());

// Settings admin UI
app.get('/admin/settings', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

app.get('/admin', requireAdmin, (_req, res) => {
  res.redirect('/admin/settings');
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiConfigured: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
    oauthConfigured: !!(process.env.DATABRICKS_OAUTH_CLIENT_ID && process.env.DATABRICKS_OAUTH_CLIENT_SECRET),
  });
});

app.listen(PORT, () => {
  console.log(`[DataPrism] Server running on http://localhost:${PORT}`);
  console.log(`[DataPrism] Settings UI: http://localhost:${PORT}/admin/settings`);
  console.log(`[DataPrism] AI mode: ${process.env.ANTHROPIC_API_KEY ? 'Claude AI' : 'Demo (mock NLP)'}`);
  console.log(`[DataPrism] OAuth: ${process.env.DATABRICKS_OAUTH_CLIENT_ID ? 'Enabled' : 'Disabled (using PAT fallback)'}`);
});
