/** Nimbus Store product catalog (static demo data — used by the browse/place-order tools and the assistant prompt). */
export interface Product {
  sku: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  description: string;
}

export const CATALOG: Product[] = [
  { sku: "AS-WH-100-BLK", name: "AuraSound Wireless Headphones (Black)", price: 129, category: "audio", inStock: true, description: "Over-ear Bluetooth headphones, active noise cancelling, 40 h battery, USB-C fast charge, 1-year warranty (2 years for Premium)." },
  { sku: "AS-WH-100-WHT", name: "AuraSound Wireless Headphones (White)", price: 129, category: "audio", inStock: false, description: "White edition of the AuraSound Wireless Headphones. Back in stock in about 2 weeks." },
  { sku: "AS-SPK-MINI-BLU", name: "AuraSound Mini Bluetooth Speaker (Blue)", price: 49, category: "audio", inStock: true, description: "Pocket-size waterproof (IPX7) speaker, 12 h battery, pairs two speakers for stereo." },
  { sku: "NB-DESK-LAMP", name: "Nimbus Smart Desk Lamp", price: 59.99, category: "home office", inStock: true, description: "Dimmable LED lamp with colour temperature control, app and voice assistant support, USB-C charging port." },
  { sku: "NB-CHAIR-ERGO", name: "Nimbus Ergo Office Chair", price: 249.99, category: "home office", inStock: true, description: "Ergonomic mesh chair with adjustable lumbar support, 4D armrests, 5-year warranty." },
  { sku: "NB-KETTLE", name: "Nimbus Smart Kettle", price: 89, category: "kitchen", inStock: true, description: "1.7 L variable-temperature kettle with keep-warm and app scheduling." },
  { sku: "NB-MUG-SET", name: "Nimbus Ceramic Mug Set", price: 18, category: "kitchen", inStock: true, description: "Set of two 350 ml stoneware mugs, dishwasher and microwave safe. Price per set." },
  { sku: "NB-BACKPACK", name: "Nimbus Commuter Backpack", price: 79, category: "bags", inStock: true, description: "20 L water-resistant backpack with padded 16\" laptop sleeve and luggage strap." },
  { sku: "NB-CABLE-USBC", name: "USB-C Cable 2m", price: 12, category: "accessories", inStock: true, description: "Braided USB-C to USB-C cable, 100 W charging, 10 Gbps data." },
];

export const PLANS = {
  free: { price: 0, perks: "standard support, 30-day returns" },
  pro: { price: 49, perks: "faster support, member deals, 30-day returns" },
  premium: { price: 99, perks: "priority 15-minute support, free express shipping, 60-day returns, extended warranties" },
} as const;

export function findProducts(query: string): Product[] {
  const q = query.toLowerCase().trim();
  if (!q) return CATALOG;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  return CATALOG.filter((p) => {
    const hay = `${p.sku} ${p.name} ${p.category} ${p.description}`.toLowerCase();
    return hay.includes(q) || words.some((w) => hay.includes(w));
  });
}

export const getProduct = (sku: string) => CATALOG.find((p) => p.sku.toLowerCase() === sku.toLowerCase().trim());
