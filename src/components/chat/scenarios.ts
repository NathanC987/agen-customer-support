import { CreditCard, Crown, KeyRound, PackageX, ShieldAlert, ShoppingBag, type LucideIcon } from "lucide-react";

export interface Scenario {
  customerId: string;
  title: string;
  message: string;
  expected: string;
  icon: LucideIcon;
}

/** Demo scenarios taken from the problem statement, each paired with a seeded customer. */
export const SCENARIOS: Scenario[] = [
  {
    customerId: "cus_priya",
    title: "Wrong item delivered",
    message: "My order was delivered but I received the wrong item.",
    expected: "Auto-resolve: verify → compare → replace → return label",
    icon: PackageX,
  },
  {
    customerId: "cus_marcus",
    title: "Payment failed, money deducted",
    message: "My payment failed but money was deducted from my account. This is really frustrating.",
    expected: "Auto-resolve: detect captured funds → refund",
    icon: CreditCard,
  },
  {
    customerId: "cus_sofia",
    title: "Unable to log in",
    message: "I can't log in to my account, it keeps saying it's locked.",
    expected: "Auto-resolve: check lock → unlock → reset link",
    icon: KeyRound,
  },
  {
    customerId: "cus_john",
    title: "Premium not activated",
    message: "I paid for Premium a few hours ago but my subscription still isn't activated.",
    expected: "Retry sync fails → Engineering ticket",
    icon: Crown,
  },
  {
    customerId: "cus_liam",
    title: "Unrecognized charges",
    message: "There are two charges on my card from ELEC-STORE ONLINE that I never made. I think someone is using my account!",
    expected: "Mandatory escalation → Trust & Safety",
    icon: ShieldAlert,
  },
  {
    customerId: "cus_aisha",
    title: "Cancel order & upgrade",
    message: "Please cancel my kettle order, and I'd also like to upgrade my plan to Premium.",
    expected: "Two actions in one turn",
    icon: ShoppingBag,
  },
];
