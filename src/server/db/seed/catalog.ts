/**
 * Seed catalogue.
 *
 * Prices are realistic Accra retail figures in pesewas (GH₵1 = 100). For
 * order-to-ship items the `priceMinor` on a variant is only a sorting hint —
 * the real price is recomputed from `supplierPriceMinor` by the landed-cost
 * engine at render time, so the two will differ and that is expected.
 *
 * Image URLs point at Unsplash. Some may 404 over time; the product card
 * degrades to a placeholder rather than breaking the grid.
 */

export interface SeedBrand {
  slug: string;
  name: string;
  authorised: boolean;
  prominence: number;
  origin: string;
  description: string;
}

export interface SeedCategory {
  slug: string;
  name: string;
  parent?: string;
  dutyBand: string;
  icon?: string;
  position: number;
}

export interface SeedVariant {
  sku: string;
  title: string;
  options: Record<string, string>;
  priceMinor: number;
  compareAtMinor?: number;
  supplierPriceMinor?: number;
  supplierCurrency?: string;
  stock?: number;
}

export interface SeedProduct {
  slug: string;
  title: string;
  subtitle: string;
  brand: string;
  category: string;
  fulfillment: "in_house" | "order_to_ship";
  sourceCountry?: string;
  description: string;
  highlights: string[];
  specs: { group: string; label: string; value: string }[];
  variants: SeedVariant[];
  images: string[];
  placeholderColor: string;
  weightGrams: number;
  /** [length, width, height] in millimetres. */
  dimensionsMm: [number, number, number];
  warrantyMonths: number;
  rating?: number;
  reviews?: number;
}

export const BRANDS: SeedBrand[] = [
  { slug: "apple", name: "Apple", authorised: true, prominence: 100, origin: "US", description: "iPhone, Mac, iPad and Watch." },
  { slug: "samsung", name: "Samsung", authorised: true, prominence: 98, origin: "KR", description: "Galaxy phones, TVs and home appliances." },
  { slug: "sony", name: "Sony", authorised: true, prominence: 92, origin: "JP", description: "Audio, cameras and PlayStation." },
  { slug: "lg", name: "LG", authorised: true, prominence: 88, origin: "KR", description: "Televisions, refrigeration and laundry." },
  { slug: "whirlpool", name: "Whirlpool", authorised: true, prominence: 82, origin: "US", description: "Kitchen and laundry appliances." },
  { slug: "bose", name: "Bose", authorised: true, prominence: 80, origin: "US", description: "Premium audio and noise cancellation." },
  { slug: "dyson", name: "Dyson", authorised: true, prominence: 84, origin: "GB", description: "Vacuums, air treatment and hair care." },
  { slug: "hp", name: "HP", authorised: true, prominence: 74, origin: "US", description: "Laptops, desktops and printing." },
  { slug: "dell", name: "Dell", authorised: true, prominence: 76, origin: "US", description: "XPS, Latitude and Alienware." },
  { slug: "lenovo", name: "Lenovo", authorised: false, prominence: 70, origin: "CN", description: "ThinkPad, Yoga and Legion." },
  { slug: "canon", name: "Canon", authorised: true, prominence: 68, origin: "JP", description: "Cameras, lenses and printers." },
  { slug: "jbl", name: "JBL", authorised: true, prominence: 72, origin: "US", description: "Portable and home audio." },
  { slug: "anker", name: "Anker", authorised: false, prominence: 60, origin: "CN", description: "Charging, cables and power stations." },
  { slug: "hisense", name: "Hisense", authorised: true, prominence: 64, origin: "CN", description: "Affordable televisions and appliances." },
  { slug: "nike", name: "Nike", authorised: false, prominence: 78, origin: "US", description: "Footwear and sportswear." },
  { slug: "adidas", name: "Adidas", authorised: false, prominence: 76, origin: "DE", description: "Footwear and sportswear." },
  { slug: "ray-ban", name: "Ray-Ban", authorised: true, prominence: 66, origin: "IT", description: "Sunglasses and optical frames." },
  { slug: "nespresso", name: "Nespresso", authorised: true, prominence: 58, origin: "CH", description: "Coffee machines and capsules." },
  { slug: "philips", name: "Philips", authorised: true, prominence: 62, origin: "NL", description: "Personal care and home." },
  { slug: "xiaomi", name: "Xiaomi", authorised: false, prominence: 68, origin: "CN", description: "Phones, wearables and smart home." },
];

export const CATEGORIES: SeedCategory[] = [
  { slug: "electronics", name: "Electronics", dutyBand: "ELECTRONICS", icon: "Smartphone", position: 0 },
  { slug: "phones", name: "Phones", parent: "electronics", dutyBand: "ELECTRONICS", position: 0 },
  { slug: "laptops", name: "Laptops", parent: "electronics", dutyBand: "COMPUTING", position: 1 },
  { slug: "tv-audio", name: "TV & Audio", parent: "electronics", dutyBand: "ELECTRONICS", position: 2 },
  { slug: "cameras", name: "Cameras", parent: "electronics", dutyBand: "ELECTRONICS", position: 3 },
  { slug: "gaming", name: "Gaming", parent: "electronics", dutyBand: "ELECTRONICS", position: 4 },
  { slug: "accessories", name: "Accessories", parent: "electronics", dutyBand: "ELECTRONICS", position: 5 },

  { slug: "home-appliances", name: "Home & Appliances", dutyBand: "APPLIANCES", icon: "Refrigerator", position: 1 },
  { slug: "kitchen", name: "Kitchen", parent: "home-appliances", dutyBand: "APPLIANCES", position: 0 },
  { slug: "laundry", name: "Laundry", parent: "home-appliances", dutyBand: "APPLIANCES", position: 1 },
  { slug: "climate", name: "Climate", parent: "home-appliances", dutyBand: "APPLIANCES", position: 2 },

  { slug: "fashion", name: "Fashion", dutyBand: "FASHION", icon: "Shirt", position: 2 },
  { slug: "footwear", name: "Footwear", parent: "fashion", dutyBand: "FASHION", position: 0 },
  { slug: "eyewear", name: "Eyewear", parent: "fashion", dutyBand: "FASHION", position: 1 },

  { slug: "beauty", name: "Beauty", dutyBand: "BEAUTY", icon: "Sparkles", position: 3 },
];

const IMG = "https://images.unsplash.com/photo-";

export const PRODUCTS: SeedProduct[] = [
  {
    slug: "apple-iphone-16-pro",
    title: "Apple iPhone 16 Pro",
    subtitle: "Titanium build, A18 Pro, 48MP Fusion camera",
    brand: "apple",
    category: "phones",
    fulfillment: "in_house",
    description:
      "The iPhone 16 Pro pairs a grade-5 titanium frame with the A18 Pro chip. Dual-SIM with eSIM " +
      "support works across MTN, Telecel and AT. Supplied with a Ghana warranty serviced locally.",
    highlights: [
      "A18 Pro chip — noticeably faster in photo processing and games",
      "48MP Fusion main camera with 5x telephoto",
      "Titanium frame, lighter than the stainless steel it replaced",
      "USB-C, and it charges from most laptop bricks",
      "Dual-SIM: keep an MTN and a Telecel line on one handset",
    ],
    specs: [
      { group: "Display", label: "Size", value: "6.3-inch Super Retina XDR" },
      { group: "Display", label: "Refresh rate", value: "ProMotion up to 120Hz" },
      { group: "Performance", label: "Chip", value: "A18 Pro" },
      { group: "Camera", label: "Main", value: "48MP Fusion, ƒ/1.78" },
      { group: "Camera", label: "Telephoto", value: "12MP 5x" },
      { group: "Battery", label: "Video playback", value: "Up to 27 hours" },
      { group: "Connectivity", label: "SIM", value: "Nano-SIM + eSIM" },
    ],
    variants: [
      { sku: "APL-IP16P-128-BLK", title: "128GB · Black Titanium", options: { storage: "128GB", colour: "Black Titanium" }, priceMinor: 1_649_900, compareAtMinor: 1_799_900, stock: 12 },
      { sku: "APL-IP16P-256-BLK", title: "256GB · Black Titanium", options: { storage: "256GB", colour: "Black Titanium" }, priceMinor: 1_849_900, stock: 8 },
      { sku: "APL-IP16P-256-NAT", title: "256GB · Natural Titanium", options: { storage: "256GB", colour: "Natural Titanium" }, priceMinor: 1_849_900, stock: 5 },
    ],
    images: [`${IMG}1695048133142-1a20484d2569?w=1200&q=80`],
    placeholderColor: "#2a2a2e",
    weightGrams: 199,
    dimensionsMm: [150, 72, 8],
    warrantyMonths: 12,
    rating: 4.8,
    reviews: 214,
  },
  {
    slug: "samsung-galaxy-s25-ultra",
    title: "Samsung Galaxy S25 Ultra",
    subtitle: "200MP camera, built-in S Pen, 6.9-inch display",
    brand: "samsung",
    category: "phones",
    fulfillment: "in_house",
    description:
      "Samsung's flagship, with the S Pen housed in the body. Strong low-light photography and the " +
      "brightest panel Samsung ships — genuinely readable in direct Accra sun.",
    highlights: [
      "200MP main sensor with much-improved night processing",
      "S Pen stores inside the phone, no separate case needed",
      "6.9-inch panel at 2,600 nits — usable outdoors",
      "Seven years of OS and security updates",
    ],
    specs: [
      { group: "Display", label: "Size", value: "6.9-inch Dynamic AMOLED 2X" },
      { group: "Display", label: "Peak brightness", value: "2,600 nits" },
      { group: "Camera", label: "Main", value: "200MP, ƒ/1.7, OIS" },
      { group: "Battery", label: "Capacity", value: "5,000mAh" },
      { group: "Connectivity", label: "SIM", value: "Dual nano-SIM + eSIM" },
    ],
    variants: [
      { sku: "SAM-S25U-256-TIT", title: "256GB · Titanium Grey", options: { storage: "256GB", colour: "Titanium Grey" }, priceMinor: 1_549_900, compareAtMinor: 1_699_900, stock: 15 },
      { sku: "SAM-S25U-512-TIT", title: "512GB · Titanium Grey", options: { storage: "512GB", colour: "Titanium Grey" }, priceMinor: 1_749_900, stock: 6 },
    ],
    images: [`${IMG}1610945415295-d9bbf067e59c?w=1200&q=80`],
    placeholderColor: "#3a3d42",
    weightGrams: 218,
    dimensionsMm: [163, 78, 8],
    warrantyMonths: 24,
    rating: 4.7,
    reviews: 168,
  },
  {
    slug: "apple-macbook-pro-14-m4",
    title: 'Apple MacBook Pro 14" (M4)',
    subtitle: "M4 chip, 16GB unified memory, 512GB SSD",
    brand: "apple",
    category: "laptops",
    fulfillment: "order_to_ship",
    sourceCountry: "US",
    description:
      "Sourced new and sealed from an authorised US retailer. Laptops enter Ghana under the ICT " +
      "concession at 0% import duty, so the landed price is far closer to the US shelf price than " +
      "most imported electronics — the breakdown on this page shows exactly how it lands.",
    highlights: [
      "M4 chip — sustained performance without thermal throttling",
      "0% import duty under the ICT concession; you still pay VAT, shown in the breakdown",
      "Liquid Retina XDR display, 1,000 nits sustained",
      "Genuinely all-day battery, around 18 hours of light work",
      "Ships from the US in 8–14 days by air economy",
    ],
    specs: [
      { group: "Performance", label: "Chip", value: "Apple M4, 10-core CPU" },
      { group: "Memory", label: "Unified memory", value: "16GB" },
      { group: "Storage", label: "SSD", value: "512GB" },
      { group: "Display", label: "Size", value: "14.2-inch Liquid Retina XDR" },
      { group: "Ports", label: "Thunderbolt", value: "3 × Thunderbolt 4" },
      { group: "Power", label: "Adapter", value: "70W USB-C (Type G adapter included)" },
    ],
    variants: [
      { sku: "APL-MBP14-M4-512", title: "M4 · 16GB · 512GB", options: { chip: "M4", memory: "16GB", storage: "512GB" }, priceMinor: 3_100_000, supplierPriceMinor: 159_900, supplierCurrency: "USD" },
      { sku: "APL-MBP14-M4-1TB", title: "M4 · 16GB · 1TB", options: { chip: "M4", memory: "16GB", storage: "1TB" }, priceMinor: 3_600_000, supplierPriceMinor: 179_900, supplierCurrency: "USD" },
    ],
    images: [`${IMG}1517336714731-489689fd1ca8?w=1200&q=80`],
    placeholderColor: "#26262a",
    weightGrams: 1600,
    dimensionsMm: [360, 250, 60],
    warrantyMonths: 12,
    rating: 4.9,
    reviews: 87,
  },
  {
    slug: "dell-xps-13-plus",
    title: "Dell XPS 13 Plus",
    subtitle: "Core Ultra 7, 16GB RAM, 512GB SSD",
    brand: "dell",
    category: "laptops",
    fulfillment: "order_to_ship",
    sourceCountry: "US",
    description:
      "A thin, well-built Windows ultrabook. Imported to order from the US; duty is 0% under the ICT " +
      "concession, so the landed cost is mostly freight and VAT.",
    highlights: [
      "Intel Core Ultra 7 with a dedicated NPU",
      "13.4-inch OLED option, excellent for photo work",
      "Under 1.3kg — genuinely portable",
      "0% import duty under the ICT concession",
    ],
    specs: [
      { group: "Performance", label: "Processor", value: "Intel Core Ultra 7 155H" },
      { group: "Memory", label: "RAM", value: "16GB LPDDR5" },
      { group: "Storage", label: "SSD", value: "512GB NVMe" },
      { group: "Display", label: "Panel", value: "13.4-inch FHD+" },
    ],
    variants: [
      { sku: "DEL-XPS13P-512", title: "Core Ultra 7 · 16GB · 512GB", options: { memory: "16GB", storage: "512GB" }, priceMinor: 2_150_000, supplierPriceMinor: 109_900, supplierCurrency: "USD" },
    ],
    images: [`${IMG}1496181133206-80ce9b88a853?w=1200&q=80`],
    placeholderColor: "#4a4a4e",
    weightGrams: 1240,
    dimensionsMm: [340, 240, 50],
    warrantyMonths: 12,
    rating: 4.4,
    reviews: 42,
  },
  {
    slug: "sony-wh-1000xm5",
    title: "Sony WH-1000XM5",
    subtitle: "Reference noise cancelling, 30-hour battery",
    brand: "sony",
    category: "tv-audio",
    fulfillment: "in_house",
    description:
      "Still the benchmark for noise cancellation. Useful on the Accra–Kumasi road and in open-plan " +
      "offices alike. In stock, with a local warranty.",
    highlights: [
      "Best-in-class noise cancellation with eight microphones",
      "30 hours per charge; three minutes gives three hours",
      "Multipoint — connected to a laptop and a phone at once",
      "Folds flat, though not into itself like the XM4",
    ],
    specs: [
      { group: "Audio", label: "Driver", value: "30mm carbon fibre composite" },
      { group: "Battery", label: "Playback", value: "30 hours with ANC on" },
      { group: "Connectivity", label: "Bluetooth", value: "5.2, LDAC and AAC" },
      { group: "Weight", label: "Headphone", value: "250g" },
    ],
    variants: [
      { sku: "SNY-XM5-BLK", title: "Black", options: { colour: "Black" }, priceMinor: 469_900, compareAtMinor: 549_900, stock: 22 },
      { sku: "SNY-XM5-SLV", title: "Platinum Silver", options: { colour: "Platinum Silver" }, priceMinor: 469_900, stock: 9 },
    ],
    images: [`${IMG}1618366712010-f4ae9c647dcb?w=1200&q=80`],
    placeholderColor: "#1e1e22",
    weightGrams: 250,
    dimensionsMm: [270, 210, 90],
    warrantyMonths: 12,
    rating: 4.8,
    reviews: 341,
  },
  {
    slug: "lg-oled-c4-55",
    title: 'LG OLED evo C4 55"',
    subtitle: "4K OLED, 144Hz, α9 AI processor",
    brand: "lg",
    category: "tv-audio",
    fulfillment: "in_house",
    description:
      "OLED contrast in a size that suits most Ghanaian living rooms. Includes a local warranty and " +
      "installation in Greater Accra.",
    highlights: [
      "Per-pixel OLED contrast — real black, not grey",
      "144Hz with VRR, good for PS5 and PC",
      "Four HDMI 2.1 ports",
      "Wall mounting and setup included in Accra",
    ],
    specs: [
      { group: "Display", label: "Panel", value: "55-inch OLED evo" },
      { group: "Display", label: "Resolution", value: "3840 × 2160" },
      { group: "Gaming", label: "Refresh rate", value: "Up to 144Hz VRR" },
      { group: "Power", label: "Voltage", value: "230V, Type G plug" },
    ],
    variants: [
      { sku: "LG-C4-55", title: '55-inch', options: { size: "55-inch" }, priceMinor: 1_249_900, compareAtMinor: 1_449_900, stock: 4 },
    ],
    images: [`${IMG}1593784991095-a205069470b6?w=1200&q=80`],
    placeholderColor: "#16161a",
    weightGrams: 17000,
    dimensionsMm: [1300, 800, 200],
    warrantyMonths: 24,
    rating: 4.7,
    reviews: 63,
  },
  {
    slug: "whirlpool-french-door-fridge",
    title: "Whirlpool 20 cu ft French Door Refrigerator",
    subtitle: "Frost-free, inverter compressor, water dispenser",
    brand: "whirlpool",
    category: "kitchen",
    fulfillment: "order_to_ship",
    sourceCountry: "US",
    description:
      "Imported to order from the US. Large appliances attract 20% import duty, which is a material " +
      "part of the landed price — the breakdown shows it in full so you can weigh it against a " +
      "locally-stocked alternative before committing.",
    highlights: [
      "Inverter compressor — quieter and steadier through voltage dips",
      "Frost-free with independent freezer control",
      "20 cu ft, enough for a family of five",
      "Shipped by sea to keep freight proportionate to the size",
    ],
    specs: [
      { group: "Capacity", label: "Total", value: "20 cu ft (566 litres)" },
      { group: "Cooling", label: "Compressor", value: "Inverter, 10-year warranty" },
      { group: "Power", label: "Voltage", value: "115V — 230V step-down transformer supplied" },
      { group: "Dimensions", label: "Height", value: "1,753mm" },
    ],
    variants: [
      { sku: "WHR-FD20-SS", title: "Stainless Steel", options: { finish: "Stainless Steel" }, priceMinor: 3_450_000, supplierPriceMinor: 189_900, supplierCurrency: "USD" },
    ],
    images: [`${IMG}1571175443880-49e1d25b2bc5?w=1200&q=80`],
    placeholderColor: "#8a8d92",
    weightGrams: 118000,
    dimensionsMm: [900, 750, 1760],
    warrantyMonths: 12,
    rating: 4.3,
    reviews: 28,
  },
  {
    slug: "dyson-v15-detect",
    title: "Dyson V15 Detect Absolute",
    subtitle: "Laser dust detection, 60-minute runtime",
    brand: "dyson",
    category: "home-appliances",
    fulfillment: "order_to_ship",
    sourceCountry: "GB",
    description:
      "Imported from the UK. The laser head genuinely finds dust you cannot see on tiled floors, " +
      "which is most Ghanaian homes.",
    highlights: [
      "Laser illuminates fine dust on hard floors",
      "Counts and sizes particles — you can see when a room is actually done",
      "60 minutes on the low setting",
      "Ships from the UK in 8–14 days",
    ],
    specs: [
      { group: "Performance", label: "Suction", value: "230 air watts" },
      { group: "Battery", label: "Runtime", value: "Up to 60 minutes" },
      { group: "Filtration", label: "Type", value: "Whole-machine HEPA" },
      { group: "Power", label: "Charger", value: "UK Type G — compatible with Ghana" },
    ],
    variants: [
      { sku: "DYS-V15-ABS", title: "Absolute", options: { edition: "Absolute" }, priceMinor: 1_180_000, supplierPriceMinor: 49_999, supplierCurrency: "GBP" },
    ],
    images: [`${IMG}1558618666-fcd25c85cd64?w=1200&q=80`],
    placeholderColor: "#b8a0c8",
    weightGrams: 3000,
    dimensionsMm: [1260, 250, 260],
    warrantyMonths: 24,
    rating: 4.6,
    reviews: 54,
  },
  {
    slug: "bose-quietcomfort-ultra",
    title: "Bose QuietComfort Ultra Headphones",
    subtitle: "Immersive audio, world-class comfort",
    brand: "bose",
    category: "tv-audio",
    fulfillment: "in_house",
    description:
      "If you wear headphones for six hours at a stretch, these are the most comfortable option we " +
      "stock. In the warehouse in Accra now.",
    highlights: [
      "The most comfortable clamp of any flagship we carry",
      "Immersive Audio widens the stage without sounding artificial",
      "24-hour battery",
      "Local warranty, serviced in Accra",
    ],
    specs: [
      { group: "Battery", label: "Playback", value: "24 hours" },
      { group: "Connectivity", label: "Bluetooth", value: "5.3 with aptX Adaptive" },
      { group: "Weight", label: "Headphone", value: "254g" },
    ],
    variants: [
      { sku: "BSE-QCU-BLK", title: "Black", options: { colour: "Black" }, priceMinor: 529_900, stock: 11 },
    ],
    images: [`${IMG}1505740420928-5e560c06d30e?w=1200&q=80`],
    placeholderColor: "#232326",
    weightGrams: 254,
    dimensionsMm: [200, 180, 80],
    warrantyMonths: 12,
    rating: 4.6,
    reviews: 129,
  },
  {
    slug: "anker-737-power-bank",
    title: "Anker 737 Power Bank (PowerCore 24K)",
    subtitle: "24,000mAh, 140W output, charges a laptop",
    brand: "anker",
    category: "accessories",
    fulfillment: "in_house",
    description:
      "Built for load-shedding. 140W output means it charges a MacBook Pro at close to full speed, " +
      "not just a phone.",
    highlights: [
      "140W USB-C output — enough for most laptops",
      "24,000mAh: roughly five phone charges",
      "Smart display shows real remaining capacity",
      "Airline-legal for carry-on",
    ],
    specs: [
      { group: "Capacity", label: "Cells", value: "24,000mAh / 86.4Wh" },
      { group: "Output", label: "USB-C 1", value: "140W max" },
      { group: "Weight", label: "Unit", value: "630g" },
    ],
    variants: [
      { sku: "ANK-737-BLK", title: "Black", options: { colour: "Black" }, priceMinor: 149_900, compareAtMinor: 179_900, stock: 34 },
    ],
    images: [`${IMG}1609091839311-d5365f9ff1c5?w=1200&q=80`],
    placeholderColor: "#2c2c30",
    weightGrams: 630,
    dimensionsMm: [155, 55, 50],
    warrantyMonths: 18,
    rating: 4.7,
    reviews: 96,
  },
  {
    slug: "sony-playstation-5-slim",
    title: "PlayStation 5 Slim (Disc Edition)",
    subtitle: "1TB SSD, 4K 120Hz, DualSense controller",
    brand: "sony",
    category: "gaming",
    fulfillment: "order_to_ship",
    sourceCountry: "GB",
    description:
      "Imported from the UK. UK stock uses a Type G plug, so it works in Ghana without an adapter — " +
      "worth noting versus US stock, which needs a converter.",
    highlights: [
      "UK model — Type G plug, no adapter needed",
      "1TB SSD, room for around 15 large titles",
      "4K at 120Hz on a compatible TV",
      "Includes one DualSense controller",
    ],
    specs: [
      { group: "Storage", label: "SSD", value: "1TB NVMe" },
      { group: "Video", label: "Output", value: "Up to 4K 120Hz, 8K support" },
      { group: "Power", label: "Plug", value: "UK Type G" },
    ],
    variants: [
      { sku: "SNY-PS5S-DISC", title: "Disc Edition", options: { edition: "Disc" }, priceMinor: 780_000, supplierPriceMinor: 47_999, supplierCurrency: "GBP" },
    ],
    images: [`${IMG}1606813907291-d86efa9b94db?w=1200&q=80`],
    placeholderColor: "#e8e8ea",
    weightGrams: 3200,
    dimensionsMm: [390, 260, 110],
    warrantyMonths: 12,
    rating: 4.8,
    reviews: 76,
  },
  {
    slug: "canon-eos-r50",
    title: "Canon EOS R50 with 18-45mm Lens",
    subtitle: "24.2MP APS-C mirrorless, 4K video",
    brand: "canon",
    category: "cameras",
    fulfillment: "in_house",
    description:
      "A genuinely good first mirrorless camera. Popular with content creators in Accra for its " +
      "autofocus and small size.",
    highlights: [
      "24.2MP APS-C sensor with Dual Pixel autofocus",
      "Uncropped 4K at 30fps",
      "Small enough to actually carry",
      "Includes the 18-45mm kit lens",
    ],
    specs: [
      { group: "Sensor", label: "Type", value: "24.2MP APS-C CMOS" },
      { group: "Video", label: "Maximum", value: "4K UHD 30fps, uncropped" },
      { group: "Weight", label: "Body", value: "375g" },
    ],
    variants: [
      { sku: "CAN-R50-KIT", title: "Body + 18-45mm", options: { kit: "18-45mm" }, priceMinor: 899_900, compareAtMinor: 999_900, stock: 7 },
    ],
    images: [`${IMG}1502920917128-1aa500764cbd?w=1200&q=80`],
    placeholderColor: "#33332f",
    weightGrams: 375,
    dimensionsMm: [180, 140, 120],
    warrantyMonths: 12,
    rating: 4.5,
    reviews: 58,
  },
  {
    slug: "hisense-inverter-ac-1-5hp",
    title: "Hisense 1.5HP Inverter Split Air Conditioner",
    subtitle: "Energy-efficient inverter, copper condenser",
    brand: "hisense",
    category: "climate",
    fulfillment: "in_house",
    description:
      "Sized for a standard Ghanaian bedroom. The inverter compressor cuts running cost noticeably " +
      "against a fixed-speed unit, which matters at current tariffs. Installation available in Accra.",
    highlights: [
      "Inverter compressor — meaningfully lower ECG bill than fixed-speed",
      "Copper condenser, better suited to coastal humidity",
      "Suits a room up to about 18m²",
      "Installation available in Greater Accra",
    ],
    specs: [
      { group: "Capacity", label: "Cooling", value: "1.5HP (12,000 BTU)" },
      { group: "Efficiency", label: "Type", value: "Full DC inverter" },
      { group: "Power", label: "Voltage", value: "230V / 50Hz" },
    ],
    variants: [
      { sku: "HIS-AC15-INV", title: "1.5HP Inverter", options: { capacity: "1.5HP" }, priceMinor: 549_900, compareAtMinor: 629_900, stock: 18 },
    ],
    images: [`${IMG}1631545806609-c2b999c1e5f6?w=1200&q=80`],
    placeholderColor: "#e4e6e8",
    weightGrams: 32000,
    dimensionsMm: [900, 350, 250],
    warrantyMonths: 24,
    rating: 4.2,
    reviews: 87,
  },
  {
    slug: "nike-air-force-1-07",
    title: "Nike Air Force 1 '07",
    subtitle: "The original, in white leather",
    brand: "nike",
    category: "footwear",
    fulfillment: "order_to_ship",
    sourceCountry: "US",
    description:
      "Imported to order from the US. Footwear attracts 20% duty, which on a lower-value item is a " +
      "larger proportion of the total than it would be on electronics — the breakdown shows exactly " +
      "how it lands so you can judge it.",
    highlights: [
      "The original 1982 silhouette, unchanged",
      "Full-grain leather upper",
      "Sourced from an authorised US retailer",
      "US sizing — check the conversion before ordering",
    ],
    specs: [
      { group: "Materials", label: "Upper", value: "Full-grain leather" },
      { group: "Sole", label: "Cushioning", value: "Nike Air encapsulated unit" },
      { group: "Sizing", label: "Scale", value: "US men's" },
    ],
    variants: [
      { sku: "NKE-AF1-WHT-42", title: "White · UK 8", options: { colour: "White", size: "UK 8" }, priceMinor: 195_000, supplierPriceMinor: 11_500, supplierCurrency: "USD" },
      { sku: "NKE-AF1-WHT-43", title: "White · UK 9", options: { colour: "White", size: "UK 9" }, priceMinor: 195_000, supplierPriceMinor: 11_500, supplierCurrency: "USD" },
    ],
    images: [`${IMG}1595950653106-6c9ebd614d3a?w=1200&q=80`],
    placeholderColor: "#f0f0f2",
    weightGrams: 900,
    dimensionsMm: [330, 220, 130],
    warrantyMonths: 0,
    rating: 4.6,
    reviews: 203,
  },
  {
    slug: "ray-ban-wayfarer-classic",
    title: "Ray-Ban Original Wayfarer Classic",
    subtitle: "Polarised G-15 lenses, acetate frame",
    brand: "ray-ban",
    category: "eyewear",
    fulfillment: "in_house",
    description: "The Wayfarer, with polarised G-15 lenses. In stock in Accra, authenticity guaranteed.",
    highlights: [
      "Polarised G-15 lenses — genuinely effective against road glare",
      "100% UV400 protection",
      "Authorised stock with the Ray-Ban authenticity card",
    ],
    specs: [
      { group: "Lens", label: "Type", value: "Polarised G-15" },
      { group: "Frame", label: "Material", value: "Acetate" },
      { group: "Protection", label: "UV", value: "UV400" },
    ],
    variants: [
      { sku: "RB-WAY-BLK-POL", title: "Black · Polarised", options: { colour: "Black", lens: "Polarised" }, priceMinor: 249_900, stock: 14 },
    ],
    images: [`${IMG}1511499767150-a48a237f0083?w=1200&q=80`],
    placeholderColor: "#1c1c20",
    weightGrams: 150,
    dimensionsMm: [160, 60, 50],
    warrantyMonths: 24,
    rating: 4.7,
    reviews: 91,
  },
  {
    slug: "nespresso-vertuo-next",
    title: "Nespresso Vertuo Next",
    subtitle: "Centrifusion brewing, five cup sizes",
    brand: "nespresso",
    category: "kitchen",
    fulfillment: "in_house",
    description: "Compact capsule machine. Capsules are stocked locally, so you are not importing coffee.",
    highlights: [
      "Five cup sizes from espresso to 414ml alto",
      "Heats in about 25 seconds",
      "Capsules stocked in Accra — no import needed for refills",
    ],
    specs: [
      { group: "Brewing", label: "System", value: "Centrifusion" },
      { group: "Capacity", label: "Water tank", value: "1.1 litres" },
      { group: "Power", label: "Voltage", value: "230V, Type G" },
    ],
    variants: [
      { sku: "NSP-VNXT-BLK", title: "Matt Black", options: { colour: "Matt Black" }, priceMinor: 289_900, compareAtMinor: 339_900, stock: 16 },
    ],
    images: [`${IMG}1517668808822-9ebb02f2a0e6?w=1200&q=80`],
    placeholderColor: "#2e2a28",
    weightGrams: 4000,
    dimensionsMm: [420, 170, 310],
    warrantyMonths: 24,
    rating: 4.4,
    reviews: 72,
  },
  {
    slug: "jbl-flip-6",
    title: "JBL Flip 6",
    subtitle: "Portable, IP67 waterproof, 12-hour battery",
    brand: "jbl",
    category: "tv-audio",
    fulfillment: "in_house",
    description: "The reliable portable speaker. Properly waterproof, and loud enough for outdoors.",
    highlights: [
      "IP67 — survives dust and full immersion",
      "12 hours per charge",
      "PartyBoost pairs two for stereo",
    ],
    specs: [
      { group: "Audio", label: "Output", value: "30W RMS" },
      { group: "Battery", label: "Playback", value: "12 hours" },
      { group: "Protection", label: "Rating", value: "IP67" },
    ],
    variants: [
      { sku: "JBL-FLIP6-BLK", title: "Black", options: { colour: "Black" }, priceMinor: 129_900, stock: 41 },
      { sku: "JBL-FLIP6-BLU", title: "Blue", options: { colour: "Blue" }, priceMinor: 129_900, stock: 23 },
    ],
    images: [`${IMG}1608043152269-423dbba4e7e1?w=1200&q=80`],
    placeholderColor: "#1a1a1e",
    weightGrams: 550,
    dimensionsMm: [180, 70, 70],
    warrantyMonths: 12,
    rating: 4.6,
    reviews: 187,
  },
  {
    slug: "lenovo-thinkpad-x1-carbon",
    title: "Lenovo ThinkPad X1 Carbon Gen 12",
    subtitle: "Core Ultra 7, 32GB RAM, 1TB SSD",
    brand: "lenovo",
    category: "laptops",
    fulfillment: "order_to_ship",
    sourceCountry: "CN",
    description:
      "Sourced from China, where ThinkPad pricing is meaningfully better than US or UK retail. " +
      "Duty is 0% under the ICT concession; freight from Shenzhen is also cheaper than from the US.",
    highlights: [
      "32GB RAM and 1TB storage as standard",
      "Under 1.1kg with a magnesium-carbon chassis",
      "The keyboard ThinkPads are bought for",
      "China sourcing keeps the landed price down",
    ],
    specs: [
      { group: "Performance", label: "Processor", value: "Intel Core Ultra 7 155U" },
      { group: "Memory", label: "RAM", value: "32GB LPDDR5x" },
      { group: "Storage", label: "SSD", value: "1TB NVMe" },
      { group: "Weight", label: "Unit", value: "1.09kg" },
    ],
    variants: [
      { sku: "LEN-X1C12-32-1TB", title: "32GB · 1TB", options: { memory: "32GB", storage: "1TB" }, priceMinor: 2_450_000, supplierPriceMinor: 1_089_000, supplierCurrency: "CNY" },
    ],
    images: [`${IMG}1588872657578-7efd1f1555ed?w=1200&q=80`],
    placeholderColor: "#212124",
    weightGrams: 1090,
    dimensionsMm: [345, 240, 45],
    warrantyMonths: 12,
    rating: 4.5,
    reviews: 39,
  },
];
