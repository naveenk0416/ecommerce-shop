export interface GeneralDetailsFieldConfig {
  key: string;
  label: string;
  maxLength: number;
  multiline?: boolean;
}

export interface GeneralDetailsSection {
  title: string;
  icon: string;
  description: string;
  fields: GeneralDetailsFieldConfig[];
}

export const GENERAL_DETAILS_SECTIONS: readonly GeneralDetailsSection[] = [
  {
    title: 'Product Information',
    icon: 'inventory_2',
    description: 'Core identity and classification for this product.',
    fields: [
      { key: 'brand', label: 'Brand', maxLength: 60 },
      { key: 'sku', label: 'SKU', maxLength: 40 },
      { key: 'modelNumber', label: 'Model Number', maxLength: 40 },
      { key: 'category', label: 'Category', maxLength: 60 },
      { key: 'subCategory', label: 'Sub Category', maxLength: 60 },
      { key: 'productType', label: 'Product Type', maxLength: 60 },
      { key: 'material', label: 'Material', maxLength: 60 },
      { key: 'color', label: 'Color', maxLength: 60 },
      { key: 'manufacturer', label: 'Manufacturer', maxLength: 80 },
      { key: 'importer', label: 'Importer', maxLength: 80 },
      { key: 'packer', label: 'Packer', maxLength: 80 },
      { key: 'countryOfOrigin', label: 'Country of Origin', maxLength: 56 },
      { key: 'hsn', label: 'HSN', maxLength: 20 },
      { key: 'gst', label: 'GST', maxLength: 10 },
    ],
  },
  {
    title: 'Pricing',
    icon: 'payments',
    description: 'Price breakdown across cost, fees, and margin.',
    fields: [
      { key: 'mrp', label: 'MRP', maxLength: 12 },
      { key: 'sellingPrice', label: 'Selling Price', maxLength: 12 },
      { key: 'discountPercent', label: 'Discount %', maxLength: 12 },
      { key: 'costPrice', label: 'Cost Price', maxLength: 12 },
      { key: 'marketplaceFee', label: 'Marketplace Fee', maxLength: 12 },
      { key: 'shippingFee', label: 'Shipping Fee', maxLength: 12 },
      { key: 'profitMargin', label: 'Profit Margin', maxLength: 12 },
    ],
  },
  {
    title: 'Inventory',
    icon: 'inventory',
    description: 'Stock levels and physical package details.',
    fields: [
      { key: 'stock', label: 'Stock', maxLength: 10 },
      { key: 'weight', label: 'Weight', maxLength: 20 },
      { key: 'dimensions', label: 'Dimensions', maxLength: 40 },
    ],
  },
  {
    title: 'Media',
    icon: 'perm_media',
    description: 'Visual assets and SEO metadata for this listing.',
    fields: [
      { key: 'images', label: 'Images', maxLength: 300, multiline: true },
      { key: 'videos', label: 'Videos', maxLength: 300, multiline: true },
      { key: 'altText', label: 'Alt Text', maxLength: 125 },
      { key: 'seoImageName', label: 'SEO Image Name', maxLength: 80 },
    ],
  },
];

/** Mock product record — stands in for a real API response. */
export const GENERAL_DETAILS_MOCK_VALUES: Record<string, string> = {
  brand: 'Sellassist Basics',
  sku: 'SA-HCC-0006',
  modelNumber: 'SA-HCC-000006',
  category: 'Fashion Accessories',
  subCategory: 'Hair Accessories',
  productType: 'Hair Claw Clip',
  material: 'Acrylic with Stainless Steel Spring',
  color: 'Multicolor (Blue, Red, Yellow, Orange, Pink, Green)',
  manufacturer: 'Sellassist Manufacturing Co.',
  importer: 'Sellassist Trading Pvt Ltd',
  packer: 'Sellassist Manufacturing Co.',
  countryOfOrigin: 'India',
  hsn: '9615',
  gst: '18%',
  mrp: '699',
  sellingPrice: '499',
  discountPercent: '29%',
  costPrice: '210',
  marketplaceFee: '58',
  shippingFee: '35',
  profitMargin: '196',
  stock: '184',
  weight: '92g',
  dimensions: '10 x 8 x 4 cm',
  images: 'https://cdn.sellassist.in/products/hcc-0006/1.jpg, https://cdn.sellassist.in/products/hcc-0006/2.jpg',
  videos: 'https://cdn.sellassist.in/products/hcc-0006/demo.mp4',
  altText: 'Flower shaped hair claw clips pack of 6 in multiple colors',
  seoImageName: 'flower-hair-claw-clips-multicolor-pack-of-6',
};

/** Mock alternate suggestions, cycled through by the Regenerate action. */
export const GENERAL_DETAILS_SUGGESTIONS: Record<string, string[]> = {
  brand: ['Sellassist Basics', 'Sellassist Prime', 'Sellassist Craft Co.'],
  sku: ['SA-HCC-0006', 'SA-HCC-0006-V2', 'SA-HCC-0006-RX'],
  modelNumber: ['SA-HCC-000006', 'SA-HCC-000006-A', 'SA-HCC-000006-B'],
  category: ['Fashion Accessories', 'Beauty & Personal Care', 'Hair Care'],
  subCategory: ['Hair Accessories', 'Hair Clips & Pins', 'Styling Accessories'],
  productType: ['Hair Claw Clip', 'Hair Clamp', 'Decorative Hair Clip'],
  material: ['Acrylic with Stainless Steel Spring', 'Premium Acrylic & Alloy Spring', 'Eco Acrylic with Reinforced Metal Spring'],
  color: [
    'Multicolor (Blue, Red, Yellow, Orange, Pink, Green)',
    'Pastel Mix (Lavender, Mint, Peach, Blush, Sky, Cream)',
    'Bold Mix (Red, Black, Gold, Purple, Teal, White)',
  ],
  manufacturer: ['Sellassist Manufacturing Co.', 'Sellassist Industries Pvt Ltd', 'Sellassist Craft Works'],
  importer: ['Sellassist Trading Pvt Ltd', 'Sellassist Imports Pvt Ltd', 'Not Available'],
  packer: ['Sellassist Manufacturing Co.', 'Sellassist Packing Unit', 'Generic Packer'],
  countryOfOrigin: ['India', 'China', 'Vietnam'],
  hsn: ['9615', '9615 10', '9615 90'],
  gst: ['18%', '12%', '5%'],
  mrp: ['699', '749', '649'],
  sellingPrice: ['499', '529', '469'],
  discountPercent: ['29%', '25%', '33%'],
  costPrice: ['210', '225', '198'],
  marketplaceFee: ['58', '62', '54'],
  shippingFee: ['35', '40', '30'],
  profitMargin: ['196', '212', '187'],
  stock: ['184', '220', '150'],
  weight: ['92g', '88g', '96g'],
  dimensions: ['10 x 8 x 4 cm', '9.5 x 7.5 x 4 cm', '10.5 x 8.5 x 4.5 cm'],
  images: [
    'https://cdn.sellassist.in/products/hcc-0006/1.jpg, https://cdn.sellassist.in/products/hcc-0006/2.jpg',
    'https://cdn.sellassist.in/products/hcc-0006/alt-1.jpg, https://cdn.sellassist.in/products/hcc-0006/alt-2.jpg',
  ],
  videos: [
    'https://cdn.sellassist.in/products/hcc-0006/demo.mp4',
    'https://cdn.sellassist.in/products/hcc-0006/unboxing.mp4',
  ],
  altText: [
    'Flower shaped hair claw clips pack of 6 in multiple colors',
    'Set of 6 colorful flower hair claw clips for women and girls',
    'Multicolor acrylic flower claw clips, pack of 6',
  ],
  seoImageName: [
    'flower-hair-claw-clips-multicolor-pack-of-6',
    'multicolor-flower-claw-clips-set-of-6',
    'hair-claw-clips-floral-design-pack6',
  ],
};
