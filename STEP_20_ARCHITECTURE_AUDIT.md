# STEP 20: Website + Desktop Software Integration Architecture Audit

## Objective
Complete architecture audit and design for integrating a companion website with the existing Reel Cutter desktop application. This is an inspection/documentation-only step — zero code changes, zero database modifications, zero commits.

---

## PART 1: Current Desktop Application Architecture

### 1.1 Electron Application Structure
- **Main Process** (`src/main/index.js`): 3,623 lines, ~85+ IPC handlers
- **Renderer Process** (`src/renderer/`): React-based UI
- **Preload Bridge** (`src/preload/index.js`): ContextBridge API, ~306 lines
- **Build System**: electron-vite + electron-builder

### 1.2 Current License System
- **License Manager** (`src/main/license/licenseManager.js`): Validates, activates, HWID binding
- **License Store** (`src/main/license/store.js`): `license.enc` persistence with HMAC + AES-256-GCM
- **Hardware ID** (`src/main/license/hwid.js`): Unique machine identifier
- **Offline Grace Period**: 72 hours

### 1.3 Current Payment Backend
- **Express Server** (`server/`): Port 3001, handles Stripe webhooks
- **Stripe Integration** (`server/providers/stripeProvider.js`): Payment processing
- **License Generator** (`server/services/licenseGenerator.js`): Creates license keys + Supabase insert
- **Email Service** (`server/services/emailService.js`): Delivers license keys via Resend/SMTP

### 1.4 Current Supabase Database
- **Single Table**: `licenses` (id, email, license_key, tier, status, hwid, activated_at, etc.)
- **RPC Functions**: `activate_license()`, `deactivate_license()`, `validate_license()`
- **RLS Policies**: Service-role only for writes, anon key for reads via RPC
- **Migrations**: 2 files for isolation + idempotency

### 1.5 Feature Tiers
- **Free**: Basic export
- **Pro**: Advanced features (workflow recipes, bulk export, scheduling, analytics)
- **Business**: All features + priority support

---

## PART 2: Current Communication Architecture

### 2.1 Desktop ↔ Supabase (Direct)
- **Client-side** (`src/shared/supabaseClient.js`): Anon key only
- **Server-side** (`src/main/supabaseClient.js`): Service-role key (main process only)
- **RPC Pattern**: Desktop calls Supabase RPC functions directly
- **Security**: RLS policies + service-role isolation

### 2.2 Desktop ↔ Payment Server (Indirect)
- **Stripe Checkout**: User redirected to Stripe hosted page
- **Webhook**: Stripe → `server/index.js` → Supabase insert → Email delivery
- **Desktop Polling**: License status checked via Supabase RPC

### 2.3 Current Limitations
- No customer accounts (license-key only auth)
- No download/update system (manual installation)
- No customer portal
- No website integration points

---

## PART 3: Website Requirements Analysis

### 3.1 Core Website Features
1. **Product Landing Page**: Features, pricing, testimonials
2. **Pricing Page**: Tier comparison, feature matrix
3. **Checkout Flow**: Stripe Checkout integration
4. **Customer Portal**: License management, download links, subscription status
5. **Download Center**: Platform-specific installers, version history
6. **Support Center**: FAQ, contact form, knowledge base

### 3.2 Integration Points
1. **License Activation**: Website ↔ Desktop communication
2. **Download Tracking**: Monitor installer downloads
3. **Subscription Management**: Upgrade/downgrade/cancel flows
4. **Customer Support**: Ticket system, live chat integration
5. **Analytics**: User behavior, conversion tracking

---

## PART 4: Communication Architecture Options

### Option A: Website ↔ Supabase (Shared Database)
```
[Website] → [Supabase] ← [Desktop App]
```
**Pros**: Single source of truth, real-time sync, simpler architecture
**Cons**: Website needs Supabase access, tighter coupling

### Option B: Website ↔ API Server ↔ Supabase
```
[Website] → [API Server] → [Supabase] ← [Desktop App]
```
**Pros**: Better security, API versioning, business logic separation
**Cons**: More infrastructure, additional deployment

### Option C: Website ↔ Desktop (Direct Communication)
```
[Website] ↔ [Desktop App] (WebSocket/Polling)
```
**Pros**: No backend needed for sync, real-time
**Cons**: Desktop must be online, complexity, security concerns

### **Recommended: Option B** (Website ↔ API Server ↔ Supabase)
- Clean separation of concerns
- Better security posture
- Scalable architecture
- Easier maintenance

---

## PART 5: Customer Purchase → Activation Flow

### 5.1 Current Flow (Desktop Only)
1. User visits website → Stripe Checkout
2. Stripe webhook → License generation → Email delivery
3. User enters license key in desktop app
4. Desktop validates via Supabase RPC
5. Feature access granted

### 5.2 Proposed Flow (With Website)
1. User visits website → Creates account (optional)
2. User selects tier → Stripe Checkout
3. Stripe webhook → License generation → Account linking
4. User receives email with:
   - License key
   - Download link
   - Customer portal access
5. User downloads installer → Installs app
6. Desktop auto-activates with license key
7. User can manage subscription via website portal

### 5.3 Account System Design
- **Optional Accounts**: Users can use license-key only (current) or create account
- **Account Benefits**: Portal access, download history, support tickets
- **Account Linking**: License keys linked to accounts via email
- **Auth Methods**: Email/password, magic link, OAuth (Google/GitHub)

---

## PART 6: Download/Update System Design

### 6.1 Download Distribution
- **Primary**: Self-hosted (VPS/cloud storage)
- **Backup**: GitHub Releases (public)
- **CDN**: Cloudflare/AWS CloudFront for performance

### 6.2 Version Management
- **Semantic Versioning**: v1.0.0, v1.1.0, v2.0.0
- **Platform-Specific**: Windows (.exe), macOS (.dmg), Linux (.AppImage)
- **Auto-Update**: Electron auto-updater (already implemented)

### 6.3 Download Tracking
- **Analytics**: Download counts, platform distribution, version adoption
- **Security**: Checksum verification, signature validation
- **Rate Limiting**: Prevent abuse

### 6.4 Update Mechanism
- **Current**: `src/main/updater.js` (Electron auto-updater)
- **Enhancement**: Delta updates, staged rollouts, update channels
- **Website Integration**: Changelog, release notes, forced updates

---

## PART 7: Security Review

### 7.1 Current Security Posture
- ✅ HWID binding prevents license sharing
- ✅ AES-256-GCM encryption for license file
- ✅ HMAC integrity verification
- ✅ RLS policies on Supabase
- ✅ Service-role isolation
- ✅ Input validation on IPC handlers
- ✅ Path traversal prevention

### 7.2 Website Security Requirements
- **HTTPS Everywhere**: TLS 1.3, HSTS
- **CSP Headers**: Prevent XSS
- **CORS Configuration**: Restrict origins
- **Rate Limiting**: Prevent brute force
- **Input Validation**: Sanitize all user inputs
- **Authentication**: Secure session management
- **Authorization**: Role-based access control

### 7.3 API Security
- **API Keys**: For server-to-server communication
- **JWT Tokens**: For user authentication
- **Request Signing**: HMAC for webhook verification
- **Idempotency**: Prevent duplicate operations

### 7.4 Data Protection
- **Encryption at Rest**: Database encryption
- **Encryption in Transit**: TLS
- **PII Handling**: GDPR compliance, data minimization
- **Backup Strategy**: Encrypted backups, retention policy

---

## PART 8: Database Schema Extensions

### 8.1 New Tables Required

```sql
-- Customer accounts (optional)
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- License ↔ Customer linking
CREATE TABLE customer_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  license_id UUID REFERENCES licenses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, license_id)
);

-- Download tracking
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES licenses(id),
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support tickets
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  license_id UUID REFERENCES licenses(id),
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Website analytics
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  customer_id UUID,
  license_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.2 Indexes
```sql
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customer_licenses_customer ON customer_licenses(customer_id);
CREATE INDEX idx_customer_licenses_license ON customer_licenses(license_id);
CREATE INDEX idx_downloads_license ON downloads(license_id);
CREATE INDEX idx_downloads_version ON downloads(version);
CREATE INDEX idx_support_tickets_customer ON support_tickets(customer_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at);
```

---

## PART 9: Technology Stack Recommendations

### 9.1 Website Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (existing)
- **Auth**: Supabase Auth (existing)
- **Payments**: Stripe (existing)
- **Hosting**: Vercel (recommended) or self-hosted
- **Analytics**: Plausible (privacy-friendly) or PostHog

### 9.2 API Server (if Option B)
- **Runtime**: Node.js + Express (existing) or Next.js API routes
- **Database**: Supabase (existing)
- **Queue**: Bull/BullMQ for background jobs
- **Cache**: Redis for sessions/rate limiting
- **Monitoring**: Sentry + Prometheus

### 9.3 Desktop App Updates
- **Auto-Update**: Electron auto-updater (existing)
- **CDN**: Cloudflare R2 or AWS S3
- **Analytics**: Custom endpoint for update tracking

---

## PART 10: Final Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        WEBSITE                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Landing │  │ Pricing │  │ Checkout│  │ Portal  │       │
│  │  Page   │  │  Page   │  │  Flow   │  │ (Login) │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │             │
│       └────────────┴────────────┴────────────┘             │
│                          │                                  │
│                    ┌─────▼─────┐                           │
│                    │  Next.js  │                           │
│                    │   App     │                           │
│                    └─────┬─────┘                           │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Supabase  │
                    │   (Auth +   │
                    │   Database) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌─────▼─────┐
       │   Stripe    │ │Email │ │  Desktop  │
       │  (Payments) │ │Service│ │    App    │
       └─────────────┘ └──────┘ └───────────┘
```

### Communication Flow
1. **Website → Supabase**: Auth, data reads/writes
2. **Website → Stripe**: Payment processing
3. **Stripe → Website**: Webhooks (via API server)
4. **Desktop → Supabase**: License validation via RPC
5. **Desktop → Auto-Update Server**: Version checks
6. **Email Service → Customer**: License key, receipts

---

## PART 11: Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Set up Next.js project with Tailwind + shadcn/ui
- [ ] Configure Supabase Auth for website
- [ ] Create database schema extensions
- [ ] Implement customer registration/login

### Phase 2: Core Website (Week 3-4)
- [ ] Build landing page
- [ ] Build pricing page
- [ ] Build checkout flow (Stripe Checkout)
- [ ] Implement webhook handling for license generation

### Phase 3: Customer Portal (Week 5-6)
- [ ] Build license management dashboard
- [ ] Build download center
- [ ] Build subscription management
- [ ] Build support ticket system

### Phase 4: Desktop Integration (Week 7-8)
- [ ] Update desktop app for auto-activation
- [ ] Implement download tracking
- [ ] Add version check/update mechanism
- [ ] Test end-to-end flow

### Phase 5: Polish & Launch (Week 9-10)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation
- [ ] Beta testing
- [ ] Production deployment

---

## PART 12: Risk Assessment

### High Risk
- **License Migration**: Existing users need seamless transition
- **Security Vulnerabilities**: New attack surfaces with website
- **Data Consistency**: Desktop ↔ Website sync issues

### Medium Risk
- **Performance**: Website load times, API response times
- **Scalability**: Handling traffic spikes
- **Maintenance**: Multiple codebases to maintain

### Low Risk
- **User Adoption**: Users may prefer current flow
- **Feature Creep**: Scope expansion during development

---

## PART 13: Success Metrics

### Technical
- **Uptime**: 99.9% availability
- **Performance**: <200ms API response time
- **Security**: Zero critical vulnerabilities
- **Test Coverage**: >80% code coverage

### Business
- **Conversion Rate**: >5% website visitors to customers
- **Customer Satisfaction**: >4.5/5 rating
- **Support Tickets**: <5% of customers
- **Churn Rate**: <5% monthly

---

## PART 14: Verification Checklist

### Steps 17-18-19 Integrity
- [ ] `src/main/license/licenseManager.js`: No modifications to HMAC validation
- [ ] `src/main/license/store.js`: Atomic write additions only, HMAC preservation
- [ ] `src/engine/batchQueue.js`: Status persistence additions only
- [ ] `test/step18-security.test.js`: Untouched
- [ ] `test/step17-security.test.js`: Untouched
- [ ] `test/step16a-security.test.js`: Untouched

### Code Integrity
- [ ] No new files created (documentation only)
- [ ] No database migrations executed
- [ ] No commits made
- [ ] No pushes executed
- [ ] Existing tests still pass

### Documentation Quality
- [ ] All 30 report items covered
- [ ] Architecture diagrams included
- [ ] Security considerations documented
- [ ] Implementation roadmap provided
- [ ] Risk assessment completed

---

## PART 15: Recommendations Summary

### Immediate Actions
1. **Create Next.js website project** (separate repository)
2. **Extend Supabase schema** with new tables
3. **Implement Supabase Auth** for website users
4. **Build core website pages** (landing, pricing, checkout)

### Medium-term Actions
1. **Build customer portal** (license management, downloads)
2. **Update desktop app** for auto-activation
3. **Implement analytics** and tracking
4. **Add support system** (tickets, FAQ)

### Long-term Actions
1. **Mobile app** (React Native) for license management
2. **API marketplace** for third-party integrations
3. **White-label solution** for other software products

---

## PART 16: Final Report Summary

### What Was Audited
- Complete desktop application architecture
- Current license and payment systems
- Supabase database structure
- Security posture and vulnerabilities
- Integration requirements

### What Was Designed
- Website architecture and technology stack
- Customer purchase → activation flow
- Download/update system
- Database schema extensions
- Security framework
- Implementation roadmap

### What Was NOT Done
- ❌ No code changes
- ❌ No database migrations
- ❌ No commits
- ❌ No pushes
- ❌ No production impact

### Next Steps
1. Review this audit report
2. Decide on implementation priorities
3. Begin Phase 1 (Foundation)
4. Iterate based on feedback

---

**Audit Completed**: STEP 20 ✅
**Status**: Documentation Only — Zero Code Changes
**Report**: This document serves as the architecture audit deliverable