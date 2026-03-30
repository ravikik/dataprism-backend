# DataPrism - Frontend Architecture Specification

**Version:** 1.0.0
**Last Updated:** 2026-03-13

---

## 1. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 18 | Functional components, hooks only |
| Language | TypeScript 5.6 | Strict mode |
| Build | Vite 5.4 | HMR, dev proxy to backend |
| UI Kit | Material-UI 5.16 | Custom theme, Emotion CSS-in-JS |
| Routing | React Router DOM 7.13 | BrowserRouter, declarative routes |
| Charts | Recharts 3.7 | Bar, line, area, pie |
| Code Highlight | Prism React Renderer 2.4 | SQL, Python, Scala, Terraform |
| State | React hooks + localStorage | No Redux/Zustand |

---

## 2. Application Structure

### 2.1 Entry Point

```
index.html → main.tsx → App.tsx
```

`App.tsx` provides:
- Dark/light theme toggle (default: dark)
- MUI `ThemeProvider` + `CssBaseline`
- `BrowserRouter` with all route definitions

### 2.2 Route Map

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `HomePage` | Landing with feature cards |
| `/chat` | `ChatPage` | Main AI conversational interface |
| `/governance` | `GovernancePage` | Governance features showcase |
| `/demo` | `DemoPage` | Leadership demo plan |
| `/docs` | `DocsPage` | Documentation hub |
| `/docs/comparison` | `ComparisonPage` | DataPrism vs Databricks Genie |
| `/docs/azure-ad-sso` | `AzureADSSOPage` | Azure AD SSO integration guide |
| `/docs/mcp` | `MCPPage` | Model Context Protocol documentation |
| `/docs/caching` | `CachingStrategyPage` | Caching strategy documentation |
| `/auth/callback` | `OAuthCallbackPage` | OAuth 2.0 redirect handler |

---

## 3. Component Hierarchy

```
App
├── ThemeProvider (MUI)
└── BrowserRouter
    └── AppShell (layout wrapper)
        ├── AppBar (top bar)
        │   ├── Logo + Title
        │   ├── Version Badge
        │   └── Dark Mode Toggle
        ├── Sidebar (navigation drawer)
        │   ├── Main Items (Home, Chat, Governance, Demo, Docs)
        │   └── Doc Sub-Items (Comparison, Azure AD, MCP, Caching)
        └── <Routes>
            ├── HomePage
            ├── ChatPage
            │   ├── ConversationDrawer (left sidebar)
            │   │   └── Conversation list (new, switch, delete)
            │   ├── Message area
            │   │   └── MessageBubble (per message)
            │   │       ├── SyntaxHighlighter (SQL blocks)
            │   │       ├── Execute SQL button
            │   │       └── ResultsView
            │   │           ├── Table view (first 100 rows)
            │   │           └── ResultsChart (auto-generated)
            │   ├── Input area (text field + send button)
            │   ├── Example questions
            │   └── SettingsDrawer (right sidebar)
            │       ├── OAuth login/logout
            │       ├── Claude API key
            │       ├── Databricks credentials (PAT)
            │       └── AWS credentials
            ├── GovernancePage
            ├── DemoPage
            ├── DocsPage / ComparisonPage / AzureADSSOPage / MCPPage / CachingStrategyPage
            └── OAuthCallbackPage
```

---

## 4. State Management

### 4.1 Conversation State (`useConversations` hook)

Persists conversations to `localStorage`. No external state library.

**State:**
```typescript
{
  conversations: Conversation[];   // All conversations
  activeId: string | null;         // Currently selected conversation
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `newConversation()` | Create empty conversation, set as active |
| `switchConversation(id)` | Change active conversation |
| `deleteConversation(id)` | Remove conversation, switch to next |
| `addMessage(message)` | Append message to active conversation |
| `getActiveConversation()` | Derived: current conversation object |
| `buildConversationSummary()` | Compress history for AI context window |

**Persistence:** Full conversation array serialized to `localStorage` on every update.

### 4.2 Token Usage Tracking (`useTokenStats` hook)

Uses `useSyncExternalStore` for external store pattern.

```typescript
interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  lastModel: string;
}
```

Accumulated across all chat calls in a session. Reset on page reload.

### 4.3 Credential State (`credentials.ts` service)

Simple `localStorage` getter/setter pairs. No reactive state — read on each API call.

| Key | localStorage Key |
|-----|-----------------|
| Anthropic API Key | `dataprism_anthropic_key` |
| Databricks Host | `dataprism_databricks_host` |
| Databricks Token | `dataprism_databricks_token` |
| Databricks Warehouse | `dataprism_databricks_warehouse` |
| AWS Access Key | `dataprism_aws_access_key` |
| AWS Secret Key | `dataprism_aws_secret_key` |
| AWS Region | `dataprism_aws_region` |

---

## 5. API Integration

### 5.1 Service Layer (`src/services/api.ts`)

All backend communication goes through typed functions:

| Function | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| `chatWithPrismAI()` | POST | `/api/chat` | Send question, get AI response |
| `executeSQL()` | POST | `/api/chat/execute-sql` | Execute SQL query directly |
| `checkAIConfig()` | GET | `/api/ai/config` | Check server AI mode |
| `getAuthStatus()` | GET | `/api/auth/status` | Check authentication state |
| `getOAuthConfig()` | GET | `/api/auth/config` | Check OAuth availability |
| `initiateOAuthLogin()` | GET | `/api/auth/login` | Get OAuth authorization URL |
| `handleOAuthCallback()` | GET | `/api/auth/callback` | Complete OAuth flow |
| `logout()` | POST | `/api/auth/logout` | End session |

### 5.2 Request Configuration

- All requests include `credentials: 'include'` for session cookies
- Custom headers from `getCredentialHeaders()` added to chat/SQL requests
- Vite dev proxy: `/api` → `http://localhost:3001` (configured in `vite.config.ts`)

### 5.3 Error Handling

```typescript
if (!res.ok) {
  const d = await res.json();
  throw new Error(d.error || 'Request failed');
}
```

Errors are caught in component-level try/catch and displayed as error messages in the chat.

---

## 6. Theming & Styling

### 6.1 Theme Configuration (`theme.ts`)

**Color Palette:**

| Token | Light Mode | Dark Mode |
|-------|-----------|-----------|
| Primary | `#4F46E5` (Indigo) | `#4F46E5` (Indigo) |
| Secondary | `#0891B2` (Cyan) | `#0891B2` (Cyan) |
| Background (default) | `#F4F2EE` | `#18181B` |
| Background (paper) | `#FAFAF8` | `#27272A` |

**Typography:**
- Body: `Inter, Roboto, -apple-system, sans-serif`
- Code: `Fira Code, JetBrains Mono, Consolas, monospace`
- Weights: 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

**Component Overrides:**
- Buttons: 8px border radius, no text transform
- Paper: 12px border radius
- Chips: 6px border radius
- Table cells: custom padding
- Alerts: filled variant styling

### 6.2 Dark Mode

- Default: Dark mode enabled (`useState(true)`)
- Toggle: IconButton in AppBar
- Implementation: `createAppTheme(darkMode: boolean)` regenerates full MUI theme
- Memoized: `useMemo(() => createAppTheme(darkMode), [darkMode])`

---

## 7. Key Features by Page

### 7.1 ChatPage (Primary Interface)

- **Input**: Text field with Enter-to-send, example question chips
- **Messages**: Scrollable message list with auto-scroll
- **SQL Display**: Syntax-highlighted SQL blocks with copy button
- **Execute Button**: One-click SQL execution from any message
- **Results Table**: Auto-formatted with column headers, up to 100 rows
- **Charts**: Auto-generated from results (bar/line/area/pie with column picker)
- **Conversations**: Left drawer with history, create/switch/delete
- **Settings**: Right drawer with credential inputs and OAuth controls
- **Token Counter**: Running total of input/output tokens

### 7.2 ResultsView

Two display modes:
1. **Table**: MUI DataGrid-style table with headers and scrolling (max 100 rows)
2. **Chart**: Recharts visualization with:
   - Auto-detection of numeric vs categorical columns
   - Chart type selector (bar, line, area, pie)
   - X/Y axis column selectors
   - Responsive container

### 7.3 OAuthCallbackPage

Handles the OAuth redirect:
1. Extracts `code` and `state` from URL query parameters
2. Calls `handleOAuthCallback(code, state)` backend API
3. On success: redirects to `/chat`
4. On error: displays error message with retry option

---

## 8. Build & Development

### 8.1 Development

```bash
npm run dev    # Starts Vite dev server at :5173 with HMR
```

Vite dev proxy forwards `/api/*` to `http://localhost:3001`.

### 8.2 Production Build

```bash
npm run build   # tsc && vite build → dist/
npm run preview # Preview production build locally
```

### 8.3 Vite Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```
