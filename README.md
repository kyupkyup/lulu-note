# Poker Player Notes Extension

Chrome extension for taking notes on poker players at play.pokerlulu.com

## 🎯 Features

- **Automatic Player Detection**: Detects player nicknames from the poker game
- **Player Notes**: Take and store notes about specific players
- **Persistent Storage**: Notes are saved locally and (optionally) synced to a server
- **Clean UI**: Minimalistic floating panel with player cards

## 🏗️ Project Structure

```
poker-notes-extension/
├── docs/
│   └── analysis.md           # Technical analysis and approach documentation
├── public/
│   ├── icons/               # Extension icons (16x16, 48x48, 128x128)
│   └── manifest.json        # Chrome extension manifest
├── src/
│   ├── background/
│   │   └── background.ts    # Service worker for API communication
│   ├── content/
│   │   ├── content.ts       # Content script (isolated context)
│   │   └── injected.ts      # Page context script (game interception)
│   ├── components/          # React components (future)
│   ├── api/
│   │   └── client.ts        # API client for server communication
│   └── types/
│       └── index.ts         # TypeScript type definitions
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Chrome browser

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd poker-notes-extension
   npm install
   ```

2. **Build the extension**:
   ```bash
   npm run build
   ```

3. **Load in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder

4. **Test**:
   - Visit https://play.pokerlulu.com/?gameId=YOUR_GAME_ID
   - Open Developer Tools (F12) and check Console for `[Poker Notes]` logs
   - Look for the floating notes panel on the right side

## 🔧 Development

### Available Scripts

```bash
# Build for production
npm run build

# Build and watch for changes
npm run watch

# Type checking
npm run type-check
```

### Development Workflow

1. Make changes to source files
2. Run `npm run build`
3. Reload extension in Chrome (`chrome://extensions/` > click reload icon)
4. Test on poker site

## 📋 Current Status

### ✅ Completed

- [x] Basic extension structure
- [x] Manifest V3 configuration
- [x] Content script injection
- [x] WebSocket interception setup
- [x] Cocos Creator hook setup
- [x] UI panel creation
- [x] Local storage for notes

### 🚧 In Progress

- [ ] **WebSocket message analysis** - Need to identify player data structure
- [ ] **Cocos Creator object inspection** - Verify `window.cc` availability
- [ ] **Extract player nicknames** - Parse actual game data

### 📅 TODO

- [ ] Backend API server (Node.js/Express)
- [ ] Database setup (PostgreSQL)
- [ ] User authentication
- [ ] Note tags and categories
- [ ] Search and filter notes
- [ ] Export/import functionality
- [ ] Settings page

## 🔍 How It Works

### Player Detection Methods

The extension tries multiple approaches to detect player nicknames:

#### 1. WebSocket Interception (Primary)
```javascript
// Intercepts WebSocket messages from game server
window.WebSocket = function(...args) {
  const ws = new originalWebSocket(...args);
  ws.addEventListener('message', (event) => {
    // Parse event.data to find player information
  });
  return ws;
};
```

#### 2. Cocos Creator Scene Graph (Secondary)
```javascript
// Access Cocos Creator's internal scene graph
const scene = window.cc.director.getScene();
const labels = findAllLabels(scene); // Extract all text labels
const nicknames = filterNicknames(labels); // Filter for player names
```

#### 3. OCR (Fallback - Not implemented yet)
If the above methods fail, Tesseract.js can be used for optical character recognition.

### Architecture

```
┌─────────────────────────────────────────┐
│          Poker Game Website             │
│  (Canvas WebGL - Cocos Creator)         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│         injected.ts                      │
│  (Page Context - Access to window.cc)   │
│  - WebSocket interception                │
│  - Cocos Creator hook                    │
└──────────────┬───────────────────────────┘
               │ postMessage
               ▼
┌──────────────────────────────────────────┐
│         content.ts                       │
│  (Isolated Context - Content Script)    │
│  - UI rendering                          │
│  - Message relay                         │
└──────────────┬───────────────────────────┘
               │ chrome.runtime.sendMessage
               ▼
┌──────────────────────────────────────────┐
│         background.ts                    │
│  (Service Worker)                        │
│  - chrome.storage.local                  │
│  - API communication (future)            │
└──────────────────────────────────────────┘
```

## 📖 Documentation

- [Technical Analysis](docs/analysis.md) - Detailed technical approach and research

## 🐛 Debugging

### Check Logs

1. **Content Script Logs**:
   - Visit poker site
   - Open DevTools (F12)
   - Check Console for `[Poker Notes]` messages

2. **Background Script Logs**:
   - Go to `chrome://extensions/`
   - Find "Poker Player Notes"
   - Click "Service Worker" to open background console

3. **Injected Script Logs**:
   - Same as Content Script (both appear in page console)

### Common Issues

**Q: No players detected**
- Check if WebSocket messages contain player data
- Run test script from `docs/analysis.md`
- Verify Cocos Creator is available: `console.log(window.cc)`

**Q: UI not showing**
- Check console for errors
- Verify `content.js` is injected: look for `[Poker Notes] Content script loaded`
- Check if panel is minimized (click + button)

**Q: Notes not saving**
- Check background service worker console
- Verify chrome.storage permissions in manifest.json

## 🔒 Privacy & Security

- Notes are stored locally in browser storage (chrome.storage.local)
- No data is sent to external servers (unless you implement the backend API)
- Extension only runs on play.pokerlulu.com domain
- No tracking or analytics

## 📝 License

MIT

## 🤝 Contributing

This is a personal project, but suggestions and improvements are welcome!

## ⚠️ Disclaimer

This extension is for educational purposes and personal use. Make sure using third-party tools complies with the poker site's terms of service.

---

**Next Steps**: See [Technical Analysis](docs/analysis.md) for what needs to be done to complete player detection.
