import type { KbArticle } from "@/lib/types";

type SeedArticle = Omit<KbArticle, "created_at" | "source" | "status">;

export const KB_SEED: SeedArticle[] = [
  /* ---------------- Troubleshooting workflows ---------------- */
  {
    id: "wf-wrong-item",
    title: "Workflow: Wrong item delivered",
    type: "troubleshooting",
    tags: ["wrong item", "incorrect", "different product", "received wrong", "mix-up", "replacement"],
    intents: ["wrong_item"],
    content:
      "Use when a customer reports receiving a different product than they ordered. Wrong-item deliveries are our fulfilment error, so the customer is always eligible for a free advance replacement or a full refund regardless of the 30-day window. The replacement ships immediately; the customer returns the wrong item with a prepaid label within 14 days.",
    workflow: {
      name: "Wrong item resolution",
      steps: [
        "Identify the order (ask for the order ID or confirm from recent orders)",
        "Verify the shipment was delivered",
        "Compare purchased vs delivered items",
        "Check return/replacement eligibility",
        "Offer a replacement (or refund if the customer prefers)",
        "Create the return request and generate a prepaid return label",
        "Create the replacement order",
        "Notify the customer with references and timelines",
      ],
      tools: [
        "list_recent_orders",
        "get_order",
        "get_shipment",
        "compare_order_items",
        "check_return_eligibility",
        "create_return_request",
        "generate_return_label",
        "create_replacement_order",
        "initiate_refund",
      ],
      autoResolvable: true,
      reliability: 0.96,
    },
  },
  {
    id: "wf-payment-deducted",
    title: "Workflow: Payment failed but money was deducted",
    type: "troubleshooting",
    tags: ["payment failed", "money deducted", "charged", "double charge", "debited", "transaction failed"],
    intents: ["payment_failure", "refund_request", "billing_question"],
    content:
      "When checkout fails after the bank has already debited the customer, the payment gateway has usually captured the funds but the order was not confirmed. If the gateway status is 'captured' and the order status is 'payment_failed', the funds must be returned: initiate a refund to the original payment method (auto-approved up to $500). If the status is only 'authorized', it is a temporary hold that the bank releases within 3–5 business days and no refund is needed.",
    workflow: {
      name: "Captured-on-failed-payment recovery",
      steps: [
        "Identify the affected order or transaction",
        "Fetch recent transactions and inspect gateway status",
        "Confirm order status is payment_failed while gateway shows captured",
        "If captured: initiate refund to original method (≤ $500 auto-approved)",
        "If only authorized: explain temporary hold release timeline",
        "Confirm refund reference and timeline with the customer",
      ],
      tools: ["list_recent_orders", "get_order", "get_transactions", "initiate_refund"],
      autoResolvable: true,
      reliability: 0.92,
    },
  },
  {
    id: "wf-login",
    title: "Workflow: Customer unable to log in",
    type: "troubleshooting",
    tags: ["login", "log in", "sign in", "locked out", "can't access", "password", "account locked"],
    intents: ["login_issue", "password_reset"],
    content:
      "Accounts lock automatically for 30 minutes after 5 failed password attempts. A lock with reason 'too_many_failed_attempts' can be lifted by support after the customer's identity is confirmed through the active chat session, followed by a password reset link sent to the email on file. Locks with reason 'suspicious_activity' must NOT be lifted by automation — escalate to Trust & Safety.",
    workflow: {
      name: "Login recovery",
      steps: [
        "Check account status",
        "Check failed password attempts",
        "Check lock status and lock reason",
        "If locked for failed attempts: unlock account and send password reset",
        "If suspicious-activity lock: escalate to Trust & Safety",
        "Suggest enabling two-factor authentication",
      ],
      tools: ["get_account_status", "unlock_account", "reset_password", "request_human_escalation"],
      autoResolvable: true,
      reliability: 0.94,
    },
  },
  {
    id: "wf-subscription-sync",
    title: "Workflow: Paid subscription not activated",
    type: "troubleshooting",
    tags: ["premium", "subscription", "not activated", "paid but", "upgrade not working", "plan not active", "sync"],
    intents: ["subscription_issue"],
    content:
      "If a customer paid for a plan but the features are not active, verify the payment transaction succeeded, then check the subscription sync status. Trigger one sync retry with the entitlement service. If the retry fails again, the issue requires Engineering review — escalate with the payment reference and the sync error code. Do not refund unless the customer asks; the payment is valid.",
    workflow: {
      name: "Entitlement sync recovery",
      steps: [
        "Check subscription plan, status and sync status",
        "Verify the payment transaction succeeded",
        "Trigger a subscription sync retry",
        "If retry succeeds: confirm activation",
        "If retry fails: escalate to Engineering with logs and error code",
      ],
      tools: ["get_subscription", "get_transactions", "retry_subscription_sync", "request_human_escalation"],
      autoResolvable: false,
      reliability: 0.88,
    },
  },
  {
    id: "wf-cancel-order",
    title: "Workflow: Cancel an order",
    type: "troubleshooting",
    tags: ["cancel", "cancellation", "don't want", "changed my mind", "stop order"],
    intents: ["cancel_order"],
    content:
      "Orders in 'processing' status can be cancelled instantly and are refunded automatically. Orders already shipped cannot be cancelled — offer a return once delivered instead.",
    workflow: {
      name: "Order cancellation",
      steps: [
        "Identify the order",
        "Check order status",
        "If processing: cancel order (refund is automatic)",
        "If shipped/delivered: explain and offer a return",
      ],
      tools: ["list_recent_orders", "get_order", "cancel_order", "check_return_eligibility", "create_return_request"],
      autoResolvable: true,
      reliability: 0.97,
    },
  },
  {
    id: "wf-refund",
    title: "Workflow: Refund or return request",
    type: "troubleshooting",
    tags: ["refund", "return", "money back", "send back", "damaged", "broken"],
    intents: ["refund_request", "return_request", "damaged_item"],
    content:
      "Delivered orders can be returned within 30 days. Damaged items qualify for a free replacement or refund regardless of window. Refunds up to $500 can be auto-approved; larger refunds need Billing approval.",
    workflow: {
      name: "Return & refund",
      steps: [
        "Identify the order",
        "Check return eligibility",
        "Create a return request and prepaid label",
        "Initiate refund (≤ $500) or escalate to Billing for approval",
        "Confirm references and timelines",
      ],
      tools: [
        "list_recent_orders",
        "get_order",
        "check_return_eligibility",
        "create_return_request",
        "generate_return_label",
        "initiate_refund",
        "create_replacement_order",
      ],
      autoResolvable: true,
      reliability: 0.9,
    },
  },
  {
    id: "wf-order-status",
    title: "Workflow: Where is my order?",
    type: "troubleshooting",
    tags: ["where is", "tracking", "delivery", "late", "not arrived", "shipping status"],
    intents: ["order_status"],
    content:
      "Look up the order and shipment, share the latest tracking event and expected delivery date. If a shipment has had no scan for more than 5 days, open a carrier trace with Logistics.",
    workflow: {
      name: "Order tracking",
      steps: ["Identify the order", "Fetch shipment tracking", "Share status and ETA", "Escalate to Logistics if stalled > 5 days"],
      tools: ["list_recent_orders", "get_order", "get_shipment", "request_human_escalation"],
      autoResolvable: true,
      reliability: 0.95,
    },
  },
  {
    id: "wf-plan-change",
    title: "Workflow: Upgrade, downgrade or reactivate a plan",
    type: "troubleshooting",
    tags: ["upgrade", "downgrade", "reactivate", "plan", "change plan", "renew"],
    intents: ["plan_change"],
    content:
      "Customers can move between Free, Pro and Premium at any time; upgrades are prorated and take effect immediately. Cancelled or inactive subscriptions can be reactivated, which charges the saved payment method.",
    workflow: {
      name: "Plan management",
      steps: ["Check current subscription", "Confirm the target plan with the customer", "Upgrade or reactivate", "Confirm new plan and billing"],
      tools: ["get_subscription", "upgrade_plan", "reactivate_subscription"],
      autoResolvable: true,
      reliability: 0.95,
    },
  },

  /* ---------------- Policies ---------------- */
  {
    id: "pol-returns",
    title: "Return & Replacement Policy",
    type: "policy",
    tags: ["return", "replacement", "30 days", "label", "exchange"],
    intents: ["return_request", "wrong_item", "damaged_item", "refund_request"],
    content:
      "Items can be returned within 30 days of delivery in original condition. Wrong or damaged items are always eligible for a free replacement or full refund, with a prepaid return label. Advance replacements ship before the original item is received. Refunds are issued to the original payment method within 5–7 business days of the return being scanned by the carrier.",
    workflow: null,
  },
  {
    id: "pol-refunds",
    title: "Refund Policy",
    type: "policy",
    tags: ["refund", "money back", "approval", "limit"],
    intents: ["refund_request", "payment_failure", "billing_question"],
    content:
      "Refunds go back to the original payment method and arrive in 5–7 business days. The AI agent may auto-approve refunds up to $500 per case. Refunds above $500, refunds on orders older than 90 days, or a third refund within 60 days require Billing team approval and must be escalated.",
    workflow: null,
  },
  {
    id: "pol-sensitive",
    title: "Sensitive Issues & Escalation Policy",
    type: "policy",
    tags: ["fraud", "unauthorized", "legal", "lawyer", "breach", "hacked", "escalation"],
    intents: ["fraud_report", "legal_request", "data_breach", "human_request"],
    content:
      "Fraud complaints and unrecognized charges go to Trust & Safety. Legal requests (subpoenas, GDPR erasure/legal holds, lawsuits) go to Legal. Suspected data breaches or account compromise go to Trust & Safety as urgent. The AI agent must not attempt to resolve these itself: acknowledge with empathy, secure the account if needed, collect key facts and escalate with a full ticket.",
    workflow: null,
  },
  {
    id: "pol-sla",
    title: "Support SLA Commitments",
    type: "policy",
    tags: ["sla", "response time", "premium", "deadline"],
    intents: ["general_inquiry"],
    content:
      "First human response targets after escalation: Premium customers — 15 minutes. Standard customers — urgent 30 minutes, high 1 hour, medium 4 hours, low 24 hours. Tickets at risk of breaching are automatically escalated to the duty supervisor.",
    workflow: null,
  },

  /* ---------------- FAQs ---------------- */
  {
    id: "faq-payments",
    title: "Payment FAQ",
    type: "faq",
    tags: ["payment", "card", "declined", "hold", "pending charge", "deducted"],
    intents: ["payment_failure", "billing_question"],
    content:
      "Why was I charged if my payment failed? Your bank may place a temporary authorization hold which is released in 3–5 business days. If the charge was captured, we refund it automatically once identified. Which payment methods do you accept? Visa, Mastercard, Amex, PayPal and Apple Pay. Why was my card declined? Common reasons are insufficient funds, an expired card, or the bank's fraud filter.",
    workflow: null,
  },
  {
    id: "faq-shipping",
    title: "Shipping & Delivery FAQ",
    type: "faq",
    tags: ["shipping", "delivery", "tracking", "carrier", "eta"],
    intents: ["order_status"],
    content:
      "Standard shipping takes 3–5 business days, express 1–2. Tracking links are emailed once the order ships. If tracking shows delivered but you can't find the parcel, check with neighbours and wait 24 hours before we open a carrier investigation.",
    workflow: null,
  },
  {
    id: "faq-subscriptions",
    title: "Nimbus Plans & Subscription FAQ",
    type: "faq",
    tags: ["subscription", "premium", "pro", "plan", "billing cycle", "renewal"],
    intents: ["subscription_issue", "plan_change", "billing_question"],
    content:
      "Nimbus offers Free, Pro ($49/yr) and Premium ($99/yr). Premium includes priority 15-minute support, free express shipping and extended 60-day returns. Upgrades are prorated and active immediately; downgrades apply at renewal. Premium activation normally takes under a minute after payment.",
    workflow: null,
  },
  {
    id: "faq-account",
    title: "Account & Security FAQ",
    type: "faq",
    tags: ["account", "password", "2fa", "two-factor", "security", "locked"],
    intents: ["login_issue", "password_reset", "account_update"],
    content:
      "After 5 failed login attempts your account locks for 30 minutes to protect you. You can reset your password from the sign-in page or ask support to send a reset link. We strongly recommend enabling two-factor authentication under Settings → Security.",
    workflow: null,
  },

  /* ---------------- Product docs ---------------- */
  {
    id: "doc-headphones",
    title: "Product Guide: AuraSound Wireless Headphones",
    type: "product_doc",
    tags: ["headphones", "aurasound", "bluetooth", "pairing", "battery", "reset"],
    intents: ["product_question"],
    content:
      "Pairing: hold the power button for 5 seconds until the LED flashes blue. Factory reset: hold power + volume down for 10 seconds. Battery: 40 hours playback, full charge in 2 hours via USB-C. Warranty: 1 year (2 years for Premium members).",
    workflow: null,
  },
  {
    id: "doc-app",
    title: "Product Guide: Nimbus App",
    type: "product_doc",
    tags: ["app", "mobile", "features", "premium features", "notifications"],
    intents: ["product_question", "subscription_issue"],
    content:
      "The Nimbus app lets you track orders, manage returns and your subscription. Premium features (priority support badge, express shipping, early access deals) appear under Account → Membership within a minute of activation. If they don't appear, sign out and back in to refresh entitlements.",
    workflow: null,
  },
];
