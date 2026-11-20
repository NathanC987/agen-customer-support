/** Initial Nimbus Store inventory (seeded into the `products` table; admins manage it from /inventory). */
export interface ProductSeed {
  sku: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  description: string;
}

export const PRODUCTS_SEED: ProductSeed[] = [
  // audio
  { sku: "AS-WH-100-BLK", name: "AuraSound Wireless Headphones (Black)", price: 129, category: "audio", stock: 24, description: "Over-ear Bluetooth headphones with active noise cancelling, 40-hour battery and USB-C fast charge. 1-year warranty (2 years for Premium)." },
  { sku: "AS-WH-100-WHT", name: "AuraSound Wireless Headphones (White)", price: 129, category: "audio", stock: 0, description: "White edition of the AuraSound noise-cancelling over-ear headphones. 40-hour battery, multipoint pairing." },
  { sku: "AS-EB-200", name: "AuraSound Pro Earbuds", price: 89, category: "audio", stock: 40, description: "True wireless in-ear buds with ANC, transparency mode, wireless charging case and IPX4 sweat resistance. 8 h + 24 h in case." },
  { sku: "AS-SPK-MINI-BLU", name: "AuraSound Mini Bluetooth Speaker (Blue)", price: 49, category: "audio", stock: 35, description: "Pocket-size waterproof (IPX7) speaker with 12-hour battery; pair two for stereo sound." },
  { sku: "AS-SPK-MAX", name: "AuraSound Max Party Speaker", price: 199, category: "audio", stock: 8, description: "360° room-filling speaker with deep bass, RGB light show, 20-hour battery and karaoke mic input." },
  { sku: "AS-SB-300", name: "AuraSound Soundbar 300", price: 249, category: "audio", stock: 6, description: "2.1 soundbar with wireless subwoofer, Dolby Atmos virtualisation, HDMI eARC and voice enhancement mode." },
  // home office
  { sku: "NB-DESK-LAMP", name: "Nimbus Smart Desk Lamp", price: 59.99, category: "home office", stock: 30, description: "Dimmable LED lamp with adjustable colour temperature, app and voice-assistant control and a USB-C charging port." },
  { sku: "NB-CHAIR-ERGO", name: "Nimbus Ergo Office Chair", price: 249.99, category: "home office", stock: 12, description: "Ergonomic mesh chair with adjustable lumbar support, 4D armrests, seat depth adjustment and a 5-year warranty." },
  { sku: "NB-DESK-STAND", name: "Nimbus Standing Desk Frame", price: 329, category: "home office", stock: 5, description: "Dual-motor electric sit-stand desk frame, 70–120 cm height range, 4 memory presets, anti-collision sensor." },
  { sku: "NB-MON-ARM", name: "Nimbus Dual Monitor Arm", price: 79, category: "home office", stock: 18, description: "Gas-spring arm for two 17–32 inch monitors (up to 9 kg each) with cable management and VESA 75/100 mounts." },
  { sku: "NB-KB-MECH", name: "Nimbus Mechanical Keyboard", price: 109, category: "home office", stock: 22, description: "75% hot-swappable mechanical keyboard, tactile switches, Bluetooth + 2.4 GHz + USB-C, white backlight." },
  { sku: "NB-MOUSE-ERGO", name: "Nimbus Ergonomic Mouse", price: 49, category: "home office", stock: 27, description: "Vertical ergonomic wireless mouse with silent clicks, 4000 DPI sensor and 70-day rechargeable battery." },
  { sku: "NB-WEBCAM-4K", name: "Nimbus 4K Webcam", price: 119, category: "home office", stock: 14, description: "4K webcam with auto-framing, dual noise-reducing mics, low-light correction and a privacy shutter." },
  // computing & accessories
  { sku: "NB-CABLE-USBC", name: "USB-C Cable 2m", price: 12, category: "accessories", stock: 150, description: "Braided USB-C to USB-C cable supporting 100 W charging and 10 Gbps data." },
  { sku: "NB-CHARGER-65", name: "Nimbus 65W GaN Charger", price: 45, category: "accessories", stock: 60, description: "Compact 3-port (2× USB-C, 1× USB-A) GaN charger, 65 W total — charges a laptop, phone and earbuds at once." },
  { sku: "NB-PWRBANK-20K", name: "Nimbus 20,000 mAh Power Bank", price: 59, category: "accessories", stock: 33, description: "20,000 mAh power bank with 30 W USB-C PD fast charging and a digital battery display. Airline safe." },
  { sku: "NB-HUB-7IN1", name: "Nimbus 7-in-1 USB-C Hub", price: 39, category: "accessories", stock: 41, description: "USB-C hub with 4K HDMI, 2× USB-A, SD/microSD readers, 100 W pass-through charging and gigabit Ethernet." },
  { sku: "NB-SSD-1TB", name: "Nimbus Portable SSD 1TB", price: 99, category: "accessories", stock: 19, description: "Pocket-size 1 TB USB-C SSD with 1,050 MB/s reads, drop resistance to 2 m and hardware encryption." },
  { sku: "NB-LAPTOP-SLEEVE", name: "Nimbus Laptop Sleeve 14\"", price: 29, category: "bags", stock: 44, description: "Water-repellent felt sleeve for 13–14 inch laptops with a magnetic accessory pocket." },
  // bags & travel
  { sku: "NB-BACKPACK", name: "Nimbus Commuter Backpack", price: 79, category: "bags", stock: 26, description: "20 L water-resistant backpack with a padded 16-inch laptop sleeve, luggage strap and hidden passport pocket." },
  { sku: "NB-DUFFEL", name: "Nimbus Weekender Duffel", price: 119, category: "bags", stock: 9, description: "40 L carry-on duffel with separate shoe compartment, padded shoulder strap and water-resistant base." },
  { sku: "NB-CARRYON", name: "Nimbus Hardshell Carry-On", price: 189, category: "bags", stock: 7, description: "Polycarbonate 36 L carry-on with 360° spinner wheels, TSA lock and a front laptop compartment." },
  // kitchen
  { sku: "NB-KETTLE", name: "Nimbus Smart Kettle", price: 89, category: "kitchen", stock: 20, description: "1.7 L variable-temperature kettle with keep-warm and app scheduling." },
  { sku: "NB-MUG-SET", name: "Nimbus Ceramic Mug Set", price: 18, category: "kitchen", stock: 80, description: "Set of two 350 ml stoneware mugs, dishwasher and microwave safe. Price per set." },
  { sku: "NB-COFFEE-GRIND", name: "Nimbus Burr Coffee Grinder", price: 69, category: "kitchen", stock: 15, description: "Conical burr grinder with 30 grind settings from espresso to French press and a 250 g bean hopper." },
  { sku: "NB-AIRFRYER", name: "Nimbus Air Fryer 5L", price: 119, category: "kitchen", stock: 11, description: "5 L digital air fryer with 8 presets, shake reminder and a dishwasher-safe non-stick basket." },
  { sku: "NB-BLENDER", name: "Nimbus Power Blender", price: 99, category: "kitchen", stock: 13, description: "1200 W blender with 1.5 L Tritan jar, smoothie and crush-ice programs and a self-clean mode." },
  { sku: "NB-BOTTLE", name: "Nimbus Insulated Bottle 750ml", price: 25, category: "kitchen", stock: 90, description: "Double-wall stainless steel bottle that keeps drinks cold 24 h or hot 12 h. Leak-proof lid." },
  // smart home
  { sku: "NB-PLUG-2PK", name: "Nimbus Smart Plug (2-pack)", price: 29, category: "smart home", stock: 55, description: "Wi-Fi smart plugs with energy monitoring, schedules and voice-assistant support. No hub required." },
  { sku: "NB-BULB-4PK", name: "Nimbus Smart Bulb (4-pack)", price: 49, category: "smart home", stock: 38, description: "E27 colour smart bulbs, 16 million colours, 806 lumens, app groups and scenes." },
  { sku: "NB-CAM-INDOOR", name: "Nimbus Indoor Security Camera", price: 59, category: "smart home", stock: 21, description: "1080p indoor camera with motion and sound alerts, night vision, two-way audio and local microSD storage." },
  { sku: "NB-DOORBELL", name: "Nimbus Video Doorbell", price: 129, category: "smart home", stock: 10, description: "2K video doorbell with head-to-toe view, package detection, quick replies and battery or wired power." },
  { sku: "NB-THERMO", name: "Nimbus Smart Thermostat", price: 149, category: "smart home", stock: 4, description: "Learning thermostat with room sensor, energy reports and geofencing. Works with most 24 V systems." },
  { sku: "NB-VACUUM-ROBO", name: "Nimbus Robot Vacuum", price: 299, category: "smart home", stock: 3, description: "LiDAR-mapping robot vacuum with 4000 Pa suction, mopping pad, no-go zones and a 150-minute runtime." },
  // fitness & outdoor
  { sku: "NB-WATCH-FIT", name: "Nimbus Fit Watch", price: 149, category: "fitness", stock: 17, description: "AMOLED fitness watch with GPS, heart rate, SpO2, sleep tracking, 100+ workout modes and 10-day battery." },
  { sku: "NB-YOGA-MAT", name: "Nimbus Yoga Mat", price: 39, category: "fitness", stock: 32, description: "6 mm non-slip TPE yoga mat with alignment lines and a carry strap." },
  { sku: "NB-DUMBBELL-ADJ", name: "Nimbus Adjustable Dumbbells", price: 229, category: "fitness", stock: 5, description: "Pair of adjustable dumbbells from 2.5 to 24 kg each with a quick dial selector and storage trays." },
  { sku: "NB-TENT-2P", name: "Nimbus Trail Tent (2-person)", price: 169, category: "outdoor", stock: 8, description: "Freestanding 2-person backpacking tent, 1.9 kg, waterproof 3000 mm flysheet, two doors and vestibules." },
  { sku: "NB-HEADLAMP", name: "Nimbus Rechargeable Headlamp", price: 29, category: "outdoor", stock: 47, description: "450-lumen USB-C rechargeable headlamp with red light mode, motion sensor and IPX6 water resistance." },
  { sku: "NB-COOLER-25", name: "Nimbus Rotomolded Cooler 25L", price: 179, category: "outdoor", stock: 0, description: "25 L rotomolded cooler keeping ice up to 5 days, bear-resistant latches and a non-slip base." },
];
