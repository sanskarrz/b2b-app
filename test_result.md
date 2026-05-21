#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



  - task: "Comprehensive Indian medicine catalog (260 SKUs) + multi-brand search"
    implemented: true
    working: true
    file: "/app/backend/seed_catalog.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Created /app/backend/seed_catalog.py with 60+ salts × 3-6 brand variants = 260 SKUs across Antibiotic/Analgesic/Cardiac/Diabetes/Gastric/Antihistamine/Respiratory/Vitamin/Antifungal/Thyroid/Steroid/Neuro/Antiviral/Urology/Dermatology/Pediatric/Contraceptive categories. Each SKU has 2-5 distributor offers with deterministic price/margin variance. Server auto-migrates from 12 → 260 products on next boot. Search by brand (e.g. 'Dolo') returns matches + same-salt alternates."

  - task: "Per-distributor Ledger with bills, payments, credit/debit notes, running balance"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added GET /api/ledger/{distributor_id} returning chronologically sorted bill/payment/credit-note/debit-note entries with running balance, plus summary (total bills, paid, due, overdue, credit notes, debit notes, closing balance, credit available). Frontend screen /app/ledger/[id].tsx renders gradient hero with closing balance, action buttons (Pay/CN/Chat), summary grid, Credit Line card with usage bar & early-settlement discount, filter chips, and entry list."

  - task: "Credit Notes & Debit Notes endpoints with credit_used adjustment"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added POST/GET /api/credit-notes and /api/debit-notes. Credit notes auto-reduce distributor.credit_used (frees up credit line). Each gets a unique CN-XXXX / DN-XXXX code."

  - task: "GST Invoice breakdown (CGST+SGST or IGST)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added GET /api/orders/{order_id}/invoice returning taxable_value + cgst/sgst (intra-state) or igst (inter-state) + per-line gst split. Pharma standard 12% (6+6)."

  - task: "Chat (per distributor) with order-attach + auto-reply"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added /api/chat/threads, /api/chat/{distributor_id} (history + auto-mark-read), POST /api/chat (with optional attach_order_id). Auto-reply stub based on keywords (delivery, scheme, credit, return). Frontend: /app/chat/index.tsx (thread list with unread badges) and /app/chat/[id].tsx (1-on-1 chat with order picker modal). Seeded demo conversations for dist-1 and dist-3."

  - task: "Vendor Ledger carousel on Payments tab"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/payments.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Payments tab now shows horizontal carousel of all 5 distributors with avatar, credit-days pill, usage progress bar (color-coded), available credit and percentage. Tap → opens full ledger."

  - task: "Distributor portal stub endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Stub GET /api/distributor-portal/dashboard returns received_orders, revenue, pending_payment, active_buyers — placeholder for future distributor-side app."

#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "B2B medicine marketplace (RX Tech) — modernize Home screen, polish backorder buttons, show per-distributor pricing (alternate brands + lowest cost + best margin), credit-line payment selector per distributor in Cart."

frontend:
  - task: "Modernized Home screen with gradient hero + polished backorder/credit cards"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/home.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Replaced flat TopBar with custom LinearGradient hero (peach→orange) showing greeting + shop name pill + notif/cart icons. Floating search bar with scan affordance. QuickAction tiles use color-tinted gradients. KPI cards get top-border accents + icons. AI Insights moved to a soft-gradient banner. Action Required section refactored: Credit Risk now has dedicated card with circular % indicator, gradient progress bar, 'Pay Now' CTA. Backorder card has icon avatar, qty pill, and two CTA buttons: 'Keep Waiting' (secondary) and gradient 'Switch Distributor' (primary). Profit Opportunities polished with icon avatars + tag pills. Animated entrance via reanimated FadeInUp."

  - task: "Cart screen with per-distributor payment method (Cash vs Credit Line)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/cart.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added per-distributor payment method toggle (Cash/UPI vs Credit Line). When Credit Line is chosen, a dynamic credit-usage panel renders showing available credit, usage progress bar (color-coded: green<60%, amber<85%, red≥85%), and post-order remaining. If subtotal > available credit, the option turns red and the place-order button disables. Each distributor group has its own gradient 'Place order' button that calls /api/orders with payment_method=cash|credit and distributor_id. Replaced Alert.alert with cross-platform choice() helper. Bottom 'Place ALL' aggregates: uses credit if any distributor has selected=credit AND feasible, else cash."

  - task: "Comprehensive search with distributor offers, lowest cost, best margin, alt brands"
    implemented: true
    working: true
    file: "/app/frontend/app/search.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Already implemented in prior session — uses /api/search/comprehensive. Renders all distributor offers per product with LOWEST and BEST MARGIN flags, plus alternate-brand (same salt) section."

backend:
  - task: "POST /orders with payment_method=credit and credit-limit deduction"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Existing endpoint accepts payment_method (cash|credit). When credit, validates distributor.credit_limit - credit_used >= total and atomically $incs credit_used. Frontend now consumes this."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Modernized Home screen with gradient hero + polished backorder/credit cards"
    - "Cart screen with per-distributor payment method (Cash vs Credit Line)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Implemented two major UI changes: (1) modernized Home with gradient hero, animated entrance, redesigned backorder + credit-warning cards; (2) Cart now has per-distributor payment method (Cash vs Credit Line) with live credit availability & progress bar. Backend already supports payment_method=credit via /api/orders. Test focus: visual polish on Home, cart flow with both payment methods (esp. credit when insufficient: button must disable), order placement and credit_used increment."
