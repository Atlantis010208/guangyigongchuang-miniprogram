# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WeChat Mini Program (小程序) for a **lighting design platform** ("光乙共创平台" - Collaborative Lighting Design Platform). The project has evolved from an Apple-style product showcase into a specialized platform connecting lighting designers with clients for architectural lighting projects (residential, commercial, office, hotel spaces).

**Business Domain**: Lighting design services marketplace - connects clients with lighting designers for projects involving illumination calculations, fixture selection, circuit planning, and construction support.

## Development Commands

### WeChat Developer Tools
- **Open project**: Import the project directory in WeChat DevTools
- **Preview**: Click "Preview" in DevTools → scan QR code with WeChat
- **Compile**: Automatic on file save; or use Ctrl+B (Cmd+B on Mac)
- **Debug**: Use DevTools Console and Debugger panels

### Cloud Functions
Cloud functions are located in `cloudfunctions/` and deployed via WeChat Cloud:
- **Deploy cloud function**: Right-click function folder in DevTools → "Upload and Deploy: Cloud Installation"
- **Install dependencies**: `cd cloudfunctions/<function-name> && npm install` before first deploy
- **Cloud environment**: `cloud1-5gb9c5u2c58ad6d7` (configured in `app.js` and cloud function configs)
- Functions available:
  - `login`: User authentication and profile management (creates/updates users in `users` collection; auto-creates collection if missing)
  - `getPhoneNumber`: Retrieve user phone number via WeChat OpenAPI using `cloud.openapi.phonenumber.getPhoneNumber`

### Local Storage Keys
Critical data stored in WeChat local storage:
- `lighting_requests`: Array of lighting design requests submitted by users
- `deposit_paid`: Boolean flag indicating priority service eligibility
- `publish_prefill`: Temporary storage for form prefill from products page quiz
- `userDoc`: Cached user document from cloud database
- `intro_quiz_done`: Flag for whether user completed initial onboarding quiz
- `cartItems`: Shopping cart items for mall products
- `hasLaunched`: Boolean flag set on first app launch

## Architecture

### Page Structure & Navigation

**Main tabs** (bottom tabBar):
1. **灯光方案** (Lighting Solutions) - `pages/products/products` - Main landing page
2. **照明计算** (Lighting Calculation) - `pages/search/search` - Dual-mode lighting calculator
3. **订单管理** (Order Management) - `pages/cart/cart` - Manages both lighting requests and mall orders

**Critical page flows**:
- **Lighting Design Request Flow**: Products page quiz → `pages/flows/publish/publish` → Submit → Cart page (order tracking)
- **Designer Workflow**: Survey → Concept → Calc → Selection → Optimize → Construction → Commission (all in `pages/flows/` subpackage)
- **E-commerce**: `pages/mall/mall` → product detail → cart → order confirm → payment result
- **Course & Toolkits**: Special assistant cards on products page linking to course/toolkit details

### Subpackages Structure

Organized into lazy-loaded subpackages for performance (see `app.json` → `subpackages`):
- `pages/flows/`: 8-stage lighting design workflow (publish, survey, concept, calc, selection, optimize, construction, commission)
- `pages/categories/`: Space type filters (residential, commercial, office, hotel)
- `pages/profile/`: User account management (home, account, requests, orders, deposit, services, addresses, favorites, receipts, feedback, settings)
- `pages/request/`: Request editing (edit) and progress tracking (progress)
- `pages/tips/`: Educational content (energy)
- `pages/activities/`, `pages/support/`, `pages/features/`: Secondary content pages

### Data Architecture

**Local-first with cloud sync**:
- Primary data stored in WeChat local storage (localStorage-like API via `wx.setStorageSync/getStorageSync`)
- Cloud database (`wx.cloud.database()`) used for:
  - User profiles (collection: `users`)
  - Orders (collection: `orders`) - includes both type='products' (lighting requests) and mall orders
  - Persistent cross-device sync

**Key data models**:
```javascript
// Lighting Request
{
  id: string,           // timestamp-based
  space: string,        // residential/commercial/office/hotel
  service: string,      // service type selected
  budget: string,       // budget range
  area: string,         // design area in sqm
  stage: string,        // project stage
  contact: string,      // contact info
  priority: boolean,    // true if deposit paid
  status: 'submitted'|'review'|'design'|'done',
  steps: Array<{key, label, done}>  // workflow tracking
}
```

### Cloud Integration

**WeChat Cloud Development** (`wx.cloud`):
- Initialized in `app.js` with env `cloud1-5gb9c5u2c58ad6d7`
- File storage: Cloud file IDs (format: `cloud://env.xxx/path`) converted to HTTPS via `wx.cloud.getTempFileURL()`
- Database: NoSQL collections accessed via `wx.cloud.database()`
- Cloud functions: Called via `wx.cloud.callFunction({ name: 'login', data: {...} })`

**Important**: Cloud initialization wrapped in try-catch as it may fail in simulator. Always check `if (wx.cloud)` before cloud operations.

### Page-Specific Architecture

#### Products Page (`pages/products/products`)
- Landing page with intro quiz for new users
- Quiz collects: area, space type, service, budget → generates estimate
- Two "assistant" cards load covers from cloud storage (toolkit & course)
- Quiz result stored as `publish_prefill` for flow/publish page

#### Search Page (Calculator) (`pages/search/search`)
**Dual-mode lighting calculator**:
1. **Tab "count"**: Calculate illuminance from fixture counts/types
   - Fixture type table with power, efficacy, source utilization factors
   - Formula: `E = (Σ total_flux × UF × MF) / area`
2. **Tab "target"**: Calculate required fixture count from target lux
   - User inputs target illuminance → calculates needed fixtures

**Formula reference**:
- `total_flux = Σ(powerW × efficacy × lengthQty × sourceUtil)` for all fixture types
- `avgLux = (total_flux × utilFactor × maintenanceFactor) / area`

#### Cart Page (`pages/cart/cart`)
- Displays two order types: lighting requests (`requests`) and mall orders (`mallOrders`)
- Filter toggle: `filterType: 'mall'` switches view
- Monitors `deposit_paid` status via polling (`startDepositMonitor`) to update priority badges
- Reloads data on `onShow()` to reflect changes from other pages

### Utility Modules

**`utils/util.js`**: Core utilities
- UI helpers: `showLoading`, `showToast`, `showConfirm`
- Storage: `setStorage`, `getStorage`, `removeStorage` (sync wrappers)
- Navigation: `navigateTo`, `redirectTo`, `switchTab`
- Performance: `debounce`, `throttle`, `deepClone`
- Haptics: `hapticFeedback(type)` - Apple-style vibration feedback
- Date formatting: `formatTime`, `formatPrice`

**`utils/api.js`**: Nearly empty (1 line) - API layer not yet implemented

**`app.js` global methods**:
- `addToCart(product)`: Add item to shopping cart with quantity management
- `removeFromCart(productId)`: Remove item from shopping cart
- `updateCartCount(count)`: Update tabBar badge (index 3) and global state
- `loadCartCount()`: Initialize cart count from storage on app launch
- `getUserInfo()`: Promise-based WeChat user profile fetch via `wx.getUserProfile`
- `userLogin()`: Get WeChat login code via `wx.login` for backend authentication
- `checkForUpdate()`: Handle mini program updates with user confirmation
- `getSystemInfo()`: Initialize system info and network monitoring

## Key Technical Patterns

### WeChat Mini Program Specifics
- **Page lifecycle**: `onLoad` → `onReady` → `onShow` → `onHide` → `onUnload`
- **Component framework**: Uses `glass-easel` (specified in `app.json`)
- **Styling**: WXSS files (CSS-like), global styles in `app.wxss`
- **Data binding**: Use `this.setData({})` to update view (similar to React setState)

### Performance Optimizations
- **Lazy loading**: `lazyCodeLoading: "requiredComponents"` in app.json
- **Subpackages**: Heavy pages split into subpackages to reduce initial load
- **Image optimization**: Cloud file IDs converted to temp URLs only when needed
- Debounced inputs in calculator for real-time recalculations

### Error Handling Pattern
Cloud operations wrapped in defensive checks:
```javascript
try {
  if (wx.cloud && wx.cloud.database) {
    // cloud operation
  }
} catch (err) {
  console.warn('Cloud operation failed', err)
  // fallback to local storage
}
```

### State Management
- **Global state**: `app.globalData` for user info, cart count, system info, network type, favorite count, search history
- **Local state**: Page-level `data` object updated via `setData()`
- **Persistence**: Critical data synced to local storage and cloud DB
- **Cross-page communication**: Use storage + `onShow()` to react to changes

## Business Logic Notes

### Priority Service System
- Users who pay a deposit (`deposit_paid = true`) get priority in request queue
- Flagged in request object as `priority: true`
- Cart page monitors this flag and updates UI badges in real-time

### Multi-Stage Workflow
Designer workflow follows 8 stages (defined in flows/ subpackage):
1. Publish (client submits request)
2. Survey (site survey)
3. Concept (concept design)
4. Calc (illuminance calculations)
5. Selection (fixture selection)
6. Optimize (optimization)
7. Construction (construction support)
8. Commission (commissioning/handover)

Each stage has dedicated page with specific inputs/outputs. Status tracked in `steps` array on request object.

### Lighting Calculation Core
Based on standard illuminance formulas:
- Supports multiple fixture types with different source utilization factors
- Accounts for utilization factor (UF) and maintenance factor (MF)
- Two-way calculation: fixtures → lux OR lux → fixtures

## Common Patterns for Development

### Adding a new page
1. Create page files: `.js`, `.wxml`, `.wxss`, `.json` in `pages/`
2. Register in `app.json` → `pages` array (or subpackage)
3. Use standard page template with lifecycle methods
4. Import util: `const util = require('../../utils/util')`

### Adding cloud database operations
1. Check cloud init in `app.js`
2. Always wrap in `if (wx.cloud)` checks
3. Use collection methods: `db.collection('name').add/get/update/remove`
4. Handle errors gracefully with local storage fallback

### Working with cloud storage images
1. Store cloud file IDs in format: `cloud://env-id.xxx/path/file.ext`
2. Convert to HTTPS before rendering: `wx.cloud.getTempFileURL({ fileList: [...] })`
3. Cache temp URLs in page data to avoid repeated conversions

### Form data flow pattern
1. Collect form data in page `data` object
2. Validate on submit (show toast for errors)
3. Generate unique ID (e.g., `Date.now().toString()`)
4. Save to local storage immediately
5. Async sync to cloud DB (non-blocking)
6. Navigate to next page or show success

## Configuration Files

- `project.config.json`: WeChat DevTools project settings, AppID: `wxe8b6b3aed51577e0`
- `app.json`: Global config - pages, tabBar (3 tabs), window settings, subpackages (7 total), cloud enabled
- `sitemap.json`: Search engine indexing rules
- `cloudfunctions/*/config.json`: Individual cloud function configs with env IDs
- `cloudfunctions/*/package.json`: Dependencies for cloud functions (uses `wx-server-sdk`)

## Design System

Follows Apple-inspired design language:
- Colors: Primary blue `#007AFF`, background `#f2f2f7`, text grays
- Typography: System font stack with specific weight/size hierarchy
- Spacing: Consistent use of rpx units (responsive pixels, 750rpx = screen width)
- Borders: Rounded corners (typically 16-24rpx)
- Interactions: Haptic feedback on important actions (`util.hapticFeedback()`), smooth transitions

## Image Asset Management

- QR code image reference: All pages should use `/images/二维码.png` (not `.jpg`)
- Cloud storage images: Format `cloud://cloud1-5gb9c5u2c58ad6d7.xxx/path/file.ext`
- Local images: Stored in `/images/` directory
- Avatar placeholders: Use `/images/个人中心.png` as default
- TabBar icons: Named pairs like `product.png`/`product-active.png`, `search.png`/`search-active.png`, `cart.png`/`cart-active.png`

## Context7 Integration

Always use context7 when code generation, setup/configuration steps, or library/API documentation is needed. This means automatically using Context7 MCP tools to resolve library IDs and get library docs without explicit user request.

## Database Collections

Cloud database collections:
- `users`: User profiles with `_openid`, `nickname`, `avatarUrl`, `phoneNumber`, `createdAt`, `updatedAt`, `role`, `isDelete`, `loginSta
- `orders`: Order records with `type` ('products' for lighting requests), `orderNo`, `category`, `params`, `status`, `paid`, `createdAt`, `userId`

## Navigation Notes

- **TabBar index**: Products=0, Search=1, Cart=2 (note: `updateCartCount` in app.js uses index 3 which may be outdated)
- **Page not found**: Redirects to `/pages/products/products` via `onPageNotFound` in app.js
- **Auth pages**: Login (`pages/auth/login/login`) and profile edit (`pages/auth/profile-edit/profile-edit`) are in main pages array, not subpackages
