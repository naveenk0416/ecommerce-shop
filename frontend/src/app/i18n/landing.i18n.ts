/**
 * Every piece of text on the landing page, in English and simple Hinglish (Devanagari with the
 * everyday English words sellers use: listing, stock, GST, HSN…). Brand and marketplace names stay
 * in English. Read through Landing.tx('key').
 */
export const LANDING_TEXT = {
  // ---- Hero ----
  heroBadge: { en: 'Made for Indian sellers', hi: 'Indian sellers के लिए बना' },
  heroLead: { en: 'Upload one photo — get Amazon, Flipkart & Meesho listings with HSN and GST.', hi: 'एक photo डालो — Amazon, Flipkart और Meesho की listing, HSN और GST के साथ।' },
  heroDashboard: { en: 'Go to Dashboard', hi: 'Dashboard पर जाओ' },
  heroSignupLink: { en: 'Or create a free account →', hi: 'या free account बनाएं →' },
  trustNoCard: { en: 'No credit card', hi: 'कोई credit card नहीं' },
  trustLanguages: { en: 'Hindi + English', hi: 'Hindi + English' },
  trustGst: { en: 'GST-compliant', hi: 'GST के हिसाब से' },

  // ---- Works with ----
  worksWith: { en: 'Works with', hi: 'इनके साथ काम करता है' },

  // ---- How it works ----
  howEyebrow: { en: 'Simple by design', hi: 'बिल्कुल आसान' },
  howTitle: { en: 'From photo to listing in 3 steps', hi: '3 steps में photo से listing' },
  step1Title: { en: 'Upload your product photo', hi: 'Product की photo upload करें' },
  step1Text: { en: 'Take a photo on your phone or use an existing one. No studio setup needed.', hi: 'Phone से photo खींचें या पुरानी photo डालें। Studio की ज़रूरत नहीं।' },
  step2Title: { en: 'AI reads your product', hi: 'AI आपका product पहचानता है' },
  step2Text: { en: 'SellAssist identifies color, material, category and writes platform-specific copy in seconds.', hi: 'SellAssist रंग, material और category पहचानकर हर platform के लिए listing सेकंडों में लिखता है।' },
  step3Title: { en: 'Copy & list instantly', hi: 'Copy करें और तुरंत list करें' },
  step3Text: { en: 'Get titles, descriptions, HSN codes and social captions — ready to paste on any marketplace.', hi: 'Title, description, HSN code और social captions — किसी भी marketplace पर paste करने के लिए तैयार।' },

  // ---- Features ----
  featEyebrow: { en: 'Everything included', hi: 'सब कुछ शामिल' },
  featTitle: { en: 'One photo. Every platform. Done.', hi: 'एक photo। हर platform। काम पूरा।' },
  featSub: {
    en: 'From listing copy to GST classification — SellAssist handles the boring stuff so you can focus on selling. Publish directly to Amazon. Flipkart publishing coming soon.',
    hi: 'Listing लिखने से GST तक — झंझट वाला काम SellAssist करता है, आप बस बेचने पर ध्यान दें। Amazon पर सीधे publish करें। Flipkart publishing जल्द आ रहा है।',
  },
  f1Title: { en: 'Image-First AI', hi: 'Photo से AI listing' },
  f1Text: { en: 'Upload a single product photo. Our AI reads colors, materials, and style — and writes the listing for you.', hi: 'बस एक product photo डालें। AI रंग, material और style पढ़कर आपकी listing लिख देता है।' },
  f2Title: { en: 'Marketplace Titles', hi: 'हर marketplace का title' },
  f2Text: { en: 'SEO-optimized titles tailored for Amazon, Flipkart, and Meesho — each platform gets its own style.', hi: 'Amazon, Flipkart और Meesho के लिए SEO वाले title — हर platform का अपना style।' },
  f3Title: { en: 'Rich Descriptions', hi: 'बढ़िया description' },
  f3Text: { en: 'Compelling product descriptions with bullet points and keywords — ready to paste.', hi: 'Bullet points और keywords के साथ असरदार description — paste करने के लिए तैयार।' },
  f4Title: { en: 'HSN + GST', hi: 'HSN code + GST दर' },
  f4Text: { en: 'Get the HSN code and GST rate under the new GST 2.0 slabs (0/5/18/40%, from 22 Sep 2025) with a clear explanation.', hi: 'नए GST 2.0 slabs (0/5/18/40%, 22 Sep 2025 से) के हिसाब से HSN code और GST rate, साफ़ समझाकर।' },
  f5Title: { en: 'Social Captions', hi: 'Social media के लिए captions' },
  f5Text: { en: 'Instagram + Facebook captions with hashtags, ready to share with your customers.', hi: 'Hashtags के साथ Instagram + Facebook captions — customers के साथ share करने के लिए तैयार।' },
  f6Title: { en: 'History & Reuse', hi: 'पुरानी listings फिर से use करें' },
  f6Text: { en: 'Every listing is saved. Browse, copy, and re-use anytime from your dashboard.', hi: 'हर listing save रहती है। Dashboard से कभी भी देखें, copy करें और फिर से use करें।' },
  f7Title: { en: 'Inventory & Stock', hi: 'Inventory और stock' },
  f7Text: { en: 'Track stock for every product, get low-stock alerts, and log sales — all next to your listings.', hi: 'हर product का stock देखें, कम stock पर alert पाएं और sales लिखें — सब listings के साथ।' },

  // ---- Inventory ----
  invEyebrow: { en: 'Inventory management', hi: 'Inventory संभालें' },
  invTitle: { en: 'Know your stock. Sell without surprises.', hi: 'अपना stock जानें। बिना झंझट बेचें।' },
  invSub: { en: 'Keep products, stock and sales in the same place you create your listings.', hi: 'Products, stock और sales — सब उसी जगह जहाँ आप listing बनाते हैं।' },
  i1Title: { en: 'Stock tracking', hi: 'Stock का हिसाब' },
  i1Text: { en: 'Quantity, cost and selling price for every product, with your total inventory value and potential profit.', hi: 'हर product की quantity, cost और selling price — कुल inventory value और होने वाले profit के साथ।' },
  i2Title: { en: 'Low-stock alerts', hi: 'कम stock का alert' },
  i2Text: { en: 'Products running low are flagged on your inventory dashboard so you can restock in time.', hi: 'जो products खत्म होने वाले हैं, वे dashboard पर दिखते हैं ताकि आप समय पर माल मंगा सकें।' },
  i3Title: { en: 'Amazon & Flipkart sync', hi: 'Amazon और Flipkart से sync' },
  i3Text: { en: 'Import your catalogue and stock from Amazon and Flipkart, and push price and stock updates back in one click.', hi: 'Amazon और Flipkart से catalogue और stock लाएं, और price व stock एक click में वापस update करें।' },
  i4Title: { en: 'Sales log', hi: 'Sales का हिसाब' },
  i4Text: { en: 'Record each sale with its platform and price — stock updates automatically.', hi: 'हर sale उसके platform और price के साथ लिखें — stock अपने आप update होता है।' },

  // ---- Final call to action ----
  ctaEyebrow: { en: 'Free to start. No credit card.', hi: 'Free में शुरू करें। कोई credit card नहीं।' },
  ctaTitle: { en: 'Ready to sell smarter?', hi: 'Smart तरीके से बेचने को तैयार?' },
  ctaText: { en: 'Join Indian sellers using SellAssist to list faster and manage stock in one place.', hi: 'SellAssist से जुड़ें — listing जल्दी बनाएं और stock एक ही जगह संभालें।' },
  ctaDashboard: { en: 'Go to Dashboard', hi: 'Dashboard पर जाएं' },
  ctaSignup: { en: 'Create your free account', hi: 'Free account बनाएं' },

  // ---- Footer ----
  footerAbout: { en: 'Bharat’s AI-powered selling assistant, helping sellers optimize their marketplace presence daily.', hi: 'भारत का AI selling assistant — sellers की online दुकान को रोज़ बेहतर बनाता है।' },
  footerMarketplaces: { en: 'Marketplaces', hi: 'कहाँ बेचें' },
  footerTools: { en: 'Tools', hi: 'हमारे tools' },
  footerCompany: { en: 'Company', hi: 'कंपनी' },
  linkGst: { en: 'GST Calculator', hi: 'GST calculator' },
  linkListing: { en: 'AI Listing Generator', hi: 'AI से listing बनाएं' },
  linkCaptions: { en: 'Instagram & Facebook Captions', hi: 'Instagram और Facebook captions' },
  linkInventory: { en: 'Inventory Management', hi: 'Inventory संभालें' },
  linkPrivacy: { en: 'Privacy Policy', hi: 'Privacy Policy' },
  linkTerms: { en: 'Terms of Service', hi: 'Terms of Service' },
  linkRefund: { en: 'Refund Policy', hi: 'Refund Policy' },
  linkContact: { en: 'Contact Us', hi: 'हमसे संपर्क करें' },
  footerRights: { en: 'All rights reserved. Built for Bharat’s sellers.', hi: 'सर्वाधिकार सुरक्षित। भारत के sellers के लिए बना।' },
} as const satisfies Record<string, { en: string; hi: string }>;

export type LandingTextKey = keyof typeof LANDING_TEXT;
