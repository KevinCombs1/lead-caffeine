import { useState, useMemo } from "react";
import { Search, BookOpen, ChevronDown, ChevronUp, Factory, Building, Home, Hammer, Car, Briefcase, Plane, Heart, GraduationCap, Utensils, Dumbbell, Sparkles, Monitor, Film, Globe, Shield, Zap, Truck, TreePine, Leaf, CreditCard, Scale, Stethoscope, Megaphone, Users, TruckIcon, Sun, Coffee, Wine, Music, ZapOff, DollarSign, BadgeDollarSign, Landmark, TrendingUp, Flame, Gem, Crown, ArrowLeftRight, Rocket, Anchor, Pickaxe, Droplets, Crosshair, Dna, Bitcoin, Wallet, Shell, Wheat, Ship, BarChart3, Receipt, Handshake, CircleDollarSign, Fingerprint, Network, ThermometerSun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

interface CategorySection {
  industry: string;
  icon: React.ReactNode;
  count: number;
  color: string;
  categories: string[];
}

const TECH_ADDITIONAL: string[] = [
  "Low-Code / No-Code Platforms",
  "RPA (Robotic Process Automation)",
  "Edge Computing Solutions",
  "Quantum Computing Services",
  "Digital Twin Technology",
  "API Management & Integration",
  "IT Asset Management",
  "Data Warehouse & Lakehouse",
  "IT Governance & Compliance",
  "Software Testing & QA Automation",
];

const FINANCIAL_ADDITIONAL: string[] = [
  "Cryptocurrency Advisory",
  "ESG & Impact Investing",
  "Family Office Services",
  "401(k) Plan Administration",
  "Fraud Detection & Prevention",
  "RegTech Solutions",
  "Payment Processing & Gateways",
  "Crowdfunding Platforms",
  "SPAC Advisory & Formation",
  "FinTech Infrastructure",
];

const LENDING_ADDITIONAL: string[] = [
  "Equipment Financing",
  "Invoice Factoring",
  "Merchant Cash Advance",
  "Bridge Loan Services",
  "Mezzanine Financing",
  "Construction Loans",
  "Agricultural Loans",
  "Student Loan Refinancing",
  "Reverse Mortgage",
  "Green Energy Loans",
];

const LEGAL_ADDITIONAL: string[] = [
  "Immigration Law",
  "Entertainment & Media Law",
  "Space Law & Aerospace",
  "Cannabis Law",
  "Data Privacy & GDPR",
  "Environmental Law",
  "Appellate & Supreme Court",
  "Military & Veterans Law",
  "Maritime & Admiralty Law",
  "Agricultural & Food Law",
];

const PI_ADDITIONAL: string[] = [
  "Dog Bite & Animal Attack",
  "Nursing Home Abuse & Neglect",
  "Construction Site Accidents",
  "Medical Device Injury",
  "Toxic Tort & Exposure",
  "Aviation & Airline Accidents",
  "Railroad & FELA Claims",
  "Bicycle & E-Scooter Accidents",
  "Pedestrian Accidents",
  "Birth Injury & Cerebral Palsy",
];

const MARKETING_ADDITIONAL: string[] = [
  "Influencer Marketing Agency",
  "Podcast Advertising Network",
  "NFT & Web3 Marketing",
  "Metaverse Marketing",
  "SMS & WhatsApp Marketing",
  "Geofencing & Beacons",
  "CTV / OTT Advertising",
  "Content Marketing & Strategy",
  "Brand Reputation Management",
  "Affiliate & Performance Marketing",
];

const STAFFING_ADDITIONAL: string[] = [
  "Remote Work Solutions",
  "Gig Economy & Freelance Staffing",
  "AI-Powered Recruiting Tools",
  "HR Compliance Audits",
  "Employee Engagement Platforms",
  "Diversity & Inclusion Consulting",
  "Payroll Services",
  "Benefits Administration",
  "HR Analytics & People Ops",
  "Talent Marketplace & Direct Sourcing",
];

const HEALTHCARE_ADDITIONAL: string[] = [
  "Telepsychiatry & Mental Health",
  "Genomic Testing & Sequencing",
  "Regenerative Medicine",
  "Medical Tourism Facilitation",
  "Concierge Medicine",
  "Mobile Health & Clinics",
  "Clinical Trial Recruitment",
  "Health & Wellness Coaching",
  "Medical Coding & Billing",
  "Infection Control Consulting",
];

const TRAVEL_ADDITIONAL: string[] = [
  "Luxury Travel Concierge",
  "Corporate Retreat Planning",
  "Adventure & Expedition Tourism",
  "Culinary & Food Tourism",
  "Wellness & Spa Retreats",
  "Pet-Friendly Hotels & Resorts",
  "Glamping & Eco-Lodges",
  "Cruise Travel Agency",
  "Destination Wedding Planning",
  "Airport Lounge & VIP Services",
];

const CONSTRUCTION_ADDITIONAL: string[] = [
  "Modular & Prefab Construction",
  "3D Printing Construction",
  "Green Building & LEED Consulting",
  "Seismic & Structural Engineering",
  "Underwater & Marine Engineering",
  "Drone Surveying & Mapping",
  "Construction Safety Consulting",
  "BIM & VDC Services",
  "Smart Building Integration",
  "Disaster Recovery Construction",
];

const AUTOMOTIVE_ADDITIONAL: string[] = [
  "EV Charging Installation",
  "Autonomous Vehicle Testing",
  "Fleet Management Software",
  "Auto Detailing & Ceramic Coating",
  "Paint Protection Film (PPF)",
  "Window Tinting Services",
  "Vehicle Wrap & Graphics",
  "Performance Tuning & ECU",
  "Classic Car Restoration",
  "Mobile Mechanic Services",
];

const INSURANCE_ADDITIONAL: string[] = [
  "Cyber Insurance",
  "Event & Special Event Insurance",
  "Pet Insurance",
  "Travel & Trip Insurance",
  "Wedding & Engagement Insurance",
  "Farm & Ranch Insurance",
  "Marine & Boat Insurance",
  "Professional Liability (E&O)",
  "Directors & Officers (D&O)",
  "Key Person & Buy-Sell Insurance",
];

const ENERGY_ADDITIONAL: string[] = [
  "Geothermal Energy Systems",
  "Tidal & Wave Energy",
  "Biomass & Bioenergy",
  "Energy Storage (BESS)",
  "Microgrid Solutions",
  "Carbon Capture & Sequestration",
  "Energy Audit & ESCO",
  "EV Charging Infrastructure",
  "Green Hydrogen Production",
  "Energy Trading & Procurement",
];

const PROFESSIONAL_ADDITIONAL: string[] = [
  "Change Management Consulting",
  "Organizational Design",
  "Executive Search & Headhunting",
  "Crisis Management & PR",
  "Public Affairs & Lobbying",
  "Technical & Proposal Writing",
  "Grant Writing & Fundraising",
  "Patent Research & Prior Art",
  "Court Reporting & Deposition",
  "Translation & Localization",
];

const EDUCATION_ADDITIONAL: string[] = [
  "Microlearning & Nano-Degrees",
  "Corporate Universities",
  "VR / AR Training Solutions",
  "Compliance & Regulatory Training",
  "Sales & Negotiation Training",
  "Executive Leadership Coaching",
  "Test Prep & Tutoring",
  "Language Learning & Immersion",
  "STEM & Robotics Education",
  "Apprenticeship & Trade Programs",
];

const FOOD_ADDITIONAL: string[] = [
  "Ghost Kitchen & Virtual Brands",
  "Food Safety & HACCP Consulting",
  "Beverage Distribution",
  "Craft Brewery & Distillery",
  "Specialty Coffee Roasting",
  "Meal Kit & Subscription Services",
  "Food Truck Catering",
  "Private Chef & Catering",
  "Wine Importing & Distribution",
  "Commercial Kitchen Design",
];

const FITNESS_ADDITIONAL: string[] = [
  "Corporate Wellness Programs",
  "Wearable Tech & Fitness Tracking",
  "Cryotherapy & Cold Therapy",
  "Float Therapy & Sensory Deprivation",
  "Infrared Sauna & Red Light",
  "Nutrition & Diet Coaching",
  "Sports Performance Training",
  "Yoga & Meditation Retreats",
  "HIIT & Functional Training Studio",
  "Pickleball & Racquet Sports",
];

const BEAUTY_ADDITIONAL: string[] = [
  "Medical Spa & MedSpa",
  "Hair Transplant & Restoration",
  "Permanent Makeup & Microblading",
  "Aesthetic Injectables & Fillers",
  "Teeth Whitening & Cosmetic Dentistry",
  "Mobile Beauty & On-Demand",
  "Barbershop & Men's Grooming",
  "Nail Salon & Nail Art",
  "Eyelash Extensions & Lifts",
  "Holistic & Ayurvedic Skin Care",
];

const MEDIA_ADDITIONAL: string[] = [
  "Podcast Production & Distribution",
  "TikTok & Short-Form Content",
  "Esports Management & Coaching",
  "Virtual & Hybrid Events",
  "Music Licensing & Rights",
  "Voice Over & Audiobook Production",
  "Stock Footage & B-Roll",
  "Animation & Motion Graphics",
  "Documentary & Non-Fiction",
  "AR / VR Content Production",
];

const TRADE_ADDITIONAL: string[] = [
  "Smart Home & IoT Installation",
  "Home Theater & AV Setup",
  "Landscape & Outdoor Lighting",
  "Gutter Installation & Guards",
  "Deck & Pergola Building",
  "Fence & Gate Installation",
  "Pool & Spa Maintenance",
  "Pressure Washing & Soft Wash",
  "Garage Door & Opener Repair",
  "HVAC Duct Cleaning & Sealing",
];

const VET_ADDITIONAL: string[] = [
  "Mobile Veterinary Clinic",
  "Animal Physical Therapy & Rehab",
  "Pet Hospice & End-of-Life",
  "Exotic Animal & Avian Care",
  "Animal Behaviorist & Training",
  "Pet Grooming & Spa",
  "Pet Boarding & Daycare",
  "Animal Nutrition & Dietetics",
  "Livestock & Large Animal Veterinary",
  "Wildlife Rehabilitation",
];

const WELLNESS_ADDITIONAL: string[] = [
  "Biohacking & Optimization",
  "Light Therapy & Photobiomodulation",
  "Sound Healing & Vibroacoustics",
  "Ayurvedic Medicine & Panchakarma",
  "Functional Medicine & Root Cause",
  "IV Therapy & Vitamin Infusions",
  "Stem Cell & Regenerative Therapy",
  "Hyperbaric Oxygen Therapy (HBOT)",
  "NAD+ Therapy & Anti-Aging",
  "Peptide Therapy & Hormones",
];

const CONSULTING_ADDITIONAL: string[] = [
  "ISO Certification (9001, 14001, 45001)",
  "GDPR & Data Privacy Compliance",
  "SOC 2 Type I / II Audit",
  "PCI DSS & Payment Security",
  "FISMA & FedRAMP Compliance",
  "NIST Cybersecurity Framework",
  "CMMC & Defense Contracting",
  "OSHA & Workplace Safety",
  "FDA 21 CFR Part 11",
  "Environmental Compliance (EPA)",
];

const SKILLED_TRADES_ADDITIONAL: string[] = [
  "Elevator & Escalator Repair",
  "Boiler & Steam Systems",
  "Industrial Pipe Fitting & Welding",
  "CNC Machining & Precision Milling",
  "Industrial Painting & Coating",
  "Rope Access & High-Altitude Work",
  "Confined Space Entry & Rescue",
  "Hazardous Material Handling (HAZMAT)",
  "Industrial Rigging & Cranes",
  "Fire Protection & Sprinkler Systems",
];

const HIGH_TICKET_ADDITIONAL: string[] = [
  "Luxury Real Estate Closer",
  "Enterprise SaaS Sales Closer",
  "Private Jet & Aircraft Sales",
  "Yacht & Superyacht Brokerage",
  "Fine Art & Auction Sales",
  "Commercial Insurance Closer",
  "M&A Deal Facilitation",
  "Private Equity Fundraising",
  "Hedge Fund Capital Raising",
  "Luxury Vehicle & Exotic Car Sales",
];

const DARK_BAIL_ADDITIONAL: string[] = [
  "Federal Bail Bonds",
  "Immigration Bail Bonds",
  "Appeal Bonds",
  "Probation Violation Bonds",
  "Transfer Bonds",
  "Signature Bonds",
  "Property Bonds",
  "Surety Bonds",
  "Bail Enforcement (Fugitive Recovery)",
  "Bail Bond Financing & Payment Plans",
];

const DARK_DEBT_ADDITIONAL: string[] = [
  "Commercial Debt Collection",
  "Medical Debt Collection",
  "Student Loan Collection",
  "Judgment Enforcement",
  "Skip Tracing & Asset Location",
  "Debt Buying & Portfolio Acquisition",
  "Debt Validation & Dispute",
  "Credit Reporting & Recovery",
  "International Debt Collection",
  "Debt Settlement Negotiation",
];

const DARK_ADULT_ADDITIONAL: string[] = [
  "Adult Content Production",
  "Adult Talent Agency",
  "Adult Website Development",
  "Adult Payment Processing",
  "Adult SEO & Marketing",
  "Adult Content Moderation",
  "Adult Toy & Product Distribution",
  "Adult Event & Convention Planning",
  "Adult Subscription Platform",
  "Adult Licensing & Compliance",
];

const DARK_CANNABIS_ADDITIONAL: string[] = [
  "Cannabis Cultivation",
  "Cannabis Extraction & Processing",
  "Cannabis Dispensary",
  "Cannabis Delivery Service",
  "Cannabis Testing Lab",
  "Hemp & CBD Products",
  "Cannabis Licensing Consulting",
  "Cannabis Real Estate",
  "Cannabis Security & Transport",
  "Psychedelic Therapy & Integration",
];

const DARK_FIREARMS_ADDITIONAL: string[] = [
  "FFL Dealership & Gun Shop",
  "Class 3 & NFA Dealer",
  "Firearm Training & CCW",
  "Tactical & Defensive Training",
  "Gunsmithing & Custom Builds",
  "Firearm Insurance",
  "Shooting Range & Indoor Facility",
  "Body Armor & Tactical Gear",
  "Ammunition Manufacturing",
  "Firearm Export & International",
];

const DARK_GAMBLING_ADDITIONAL: string[] = [
  "Sports Betting Platform",
  "Online Casino & iGaming",
  "Poker Room & Tournament",
  "Horse Racing & OTB",
  "Lottery & Scratch-Off Distribution",
  "Gambling Software Development",
  "Affiliate Marketing for Gambling",
  "Gambling Licensing & Compliance",
  "Responsible Gambling Consulting",
  "Crypto Gambling & Blockchain",
];

const DARK_PAWN_ADDITIONAL: string[] = [
  "Pawn Shop & Collateral Loans",
  "Jewelry Buying & Estate",
  "Rare Coin & Precious Metals",
  "Musical Instrument Pawn",
  "Electronics & Tech Pawn",
  "Auto Title Loans",
  "Luxury Watch & Handbag Consignment",
  "Firearm Pawn & Sales",
  "Art & Collectibles Pawn",
  "Pawn Shop Software & POS",
];

const DARK_TOWING_ADDITIONAL: string[] = [
  "Heavy-Duty & Rotator Towing",
  "Accident Recovery & Cleanup",
  "Impound & Police Towing",
  "Motorcycle & Specialty Towing",
  "Long-Distance & Cross-Country",
  "Roadside Assistance & Lockout",
  "Towing Dispatch Software",
  "Towing Insurance & Liability",
  "Towing Fleet Management",
  "Towing & Recovery Training",
];

const DARK_WASTE_ADDITIONAL: string[] = [
  "Hazardous Waste Disposal",
  "Medical Waste Management",
  "Electronic Waste (E-Waste) Recycling",
  "Industrial Waste Collection",
  "Landfill & Transfer Station",
  "Waste-to-Energy Conversion",
  "Composting & Organic Waste",
  "Oil & Chemical Spill Cleanup",
  "Asbestos & Mold Remediation",
  "Underground Tank Removal",
];

const DARK_REPO_ADDITIONAL: string[] = [
  "Auto Repossession & Recovery",
  "Equipment & Machinery Repo",
  "Aircraft & Marine Repo",
  "RV & Motorhome Repo",
  "Storage Unit Auctions",
  "Judgment Asset Seizure",
  "Bankruptcy Asset Liquidation",
  "Repo Skip Tracing",
  "Repo Insurance & Bonding",
  "Repo Software & Dispatch",
];

const DARK_PEST_ADDITIONAL: string[] = [
  "Termite & Wood-Destroying Inspection",
  "Bed Bug Extermination",
  "Mosquito & Tick Control",
  "Wildlife & Animal Removal",
  "Bird & Bat Exclusion",
  "Snake & Reptile Removal",
  "Agricultural Pest Control",
  "Food Processing Pest Management",
  "Pest Control Software & Routing",
  "Organic & Green Pest Control",
];

const DARK_LIQUIDATION_ADDITIONAL: string[] = [
  "Retail Store Liquidation",
  "Restaurant & Bar Liquidation",
  "Office & Corporate Liquidation",
  "Industrial & Factory Liquidation",
  "Medical Equipment Liquidation",
  "Agricultural & Farm Liquidation",
  "Hotel & Hospitality Liquidation",
  "Auction & Estate Liquidation",
  "Distressed Asset Advisory",
  "Bankruptcy Liquidation Services",
];

const REAL_ESTATE_ADDITIONAL: string[] = [
  "Affordable Housing Developer",
  "Student Housing & Off-Campus",
  "Senior Living & Assisted Living",
  "Mobile Home Parks & Communities",
  "Self-Storage Facilities",
  "Data Center Real Estate",
  "Cold Storage & Refrigerated Warehouses",
  "Flex Industrial & R&D Space",
  "Build-to-Rent (BTR) Communities",
  "Co-Living & Co-Housing Spaces",
  "Life Sciences & Biotech Real Estate",
  "Parking Structure & Garage Development",
  "Billboard & Outdoor Advertising Real Estate",
  "Cell Tower & Telecommunications Leasing",
  "RV Parks & Campgrounds",
  "Marinas & Waterfront Properties",
  "Land Banking & Land Assemblage",
  "Brownfield Redevelopment",
  "Opportunity Zone Investing",
  "Fractional & Tokenized Ownership",
  "PropTech & Real Estate Technology",
];

const MANUFACTURING_100: string[] = [
  "Aerospace Component Manufacturing",
  "Automotive Parts Manufacturing",
  "Medical Device Manufacturing",
  "Pharmaceutical Manufacturing",
  "Food & Beverage Processing",
  "Textile & Apparel Manufacturing",
  "Electronics & PCB Assembly",
  "Semiconductor Fabrication",
  "Plastic Injection Molding",
  "Metal Fabrication & Stamping",
  "Chemical & Petrochemical Manufacturing",
  "Rubber & Tire Manufacturing",
  "Glass & Ceramics Manufacturing",
  "Wood & Lumber Processing",
  "Paper & Pulp Manufacturing",
  "Printing & Packaging Manufacturing",
  "Steel & Iron Foundry",
  "Aluminum Extrusion & Rolling",
  "Copper & Wire Manufacturing",
  "Battery & Energy Storage Manufacturing",
  "Solar Panel Manufacturing",
  "Wind Turbine Component Manufacturing",
  "Electric Vehicle Component Manufacturing",
  "Rail & Locomotive Manufacturing",
  "Shipbuilding & Marine Manufacturing",
  "Construction Material Manufacturing",
  "HVAC Equipment Manufacturing",
  "Plumbing Fixture Manufacturing",
  "Lighting & Fixture Manufacturing",
  "Furniture & Fixture Manufacturing",
  "Mattress & Bedding Manufacturing",
  "Toy & Game Manufacturing",
  "Sporting Goods Manufacturing",
  "Musical Instrument Manufacturing",
  "Jewelry & Watch Manufacturing",
  "Cosmetic & Personal Care Manufacturing",
  "Soap & Detergent Manufacturing",
  "Paint & Coating Manufacturing",
  "Adhesive & Sealant Manufacturing",
  "Fertilizer & Agricultural Chemical Manufacturing",
  "Pesticide & Herbicide Manufacturing",
  "Industrial Gas Manufacturing",
  "Refrigeration Equipment Manufacturing",
  "Pump & Compressor Manufacturing",
  "Valve & Fitting Manufacturing",
  "Bearing & Gear Manufacturing",
  "Conveyor & Material Handling Equipment",
  "Industrial Oven & Furnace Manufacturing",
  "Robotics & Automation Manufacturing",
  "3D Printing & Additive Manufacturing",
  "CNC Machine Tool Manufacturing",
  "Laser Cutting & Welding Equipment",
  "Industrial Robot Manufacturing",
  "Packaging Machinery Manufacturing",
  "Food Processing Equipment Manufacturing",
  "Pharmaceutical Packaging Equipment",
  "Cleanroom Equipment Manufacturing",
  "Laboratory Equipment Manufacturing",
  "Scientific Instrument Manufacturing",
  "Optical Instrument Manufacturing",
  "Measuring & Control Instrument Manufacturing",
  "Security & Surveillance Equipment Manufacturing",
  "Fire & Safety Equipment Manufacturing",
  "Environmental Control Equipment Manufacturing",
  "Water Treatment Equipment Manufacturing",
  "Waste Management Equipment Manufacturing",
  "Mining & Oil Field Equipment Manufacturing",
  "Construction & Mining Machinery Manufacturing",
  "Farm & Agricultural Machinery Manufacturing",
  "Lawn & Garden Equipment Manufacturing",
  "Snow & Ice Removal Equipment Manufacturing",
  "Industrial Truck & Forklift Manufacturing",
  "Aircraft Engine & Turbine Manufacturing",
  "Guided Missile & Space Vehicle Manufacturing",
  "Tank & Armored Vehicle Manufacturing",
  "Ammunition & Ordnance Manufacturing",
  "Explosives Manufacturing",
  "Small Arms Manufacturing",
  "Cutlery & Hand Tool Manufacturing",
  "Hardware & Fastener Manufacturing",
  "Spring & Wire Product Manufacturing",
  "Screw & Bolt Manufacturing",
  "Industrial Mold Manufacturing",
  "Tool & Die Manufacturing",
  "Machine Shop & Precision Machining",
  "Forging & Casting",
  "Heat Treating & Metal Finishing",
  "Electroplating & Anodizing",
  "Powder Coating & Industrial Painting",
  "Sawmill & Wood Preservation",
  "Millwork & Cabinet Manufacturing",
  "Truss & Structural Component Manufacturing",
  "Prefabricated Building Manufacturing",
  "Modular Home Manufacturing",
  "Mobile Home Manufacturing",
  "Recreational Vehicle Manufacturing",
  "Boat & Marine Craft Manufacturing",
  "Motorcycle & Bicycle Manufacturing",
  "Snowmobile & ATV Manufacturing",
  "Golf Cart & Utility Vehicle Manufacturing",
  "Wheelchair & Mobility Device Manufacturing",
  "Prosthetic & Orthotic Manufacturing",
  "Dental Equipment & Supply Manufacturing",
  "Veterinary Equipment & Supply Manufacturing",
  "Animal Feed Manufacturing",
  "Pet Food & Treat Manufacturing",
  "Brewery & Distillery Equipment Manufacturing",
  "Commercial Kitchen Equipment Manufacturing",
  "Bakery & Confectionery Manufacturing",
  "Dairy Product Manufacturing",
  "Meat & Poultry Processing",
  "Seafood Processing & Canning",
  "Fruit & Vegetable Processing",
  "Snack & Nut Manufacturing",
  "Coffee & Tea Manufacturing",
  "Spice & Seasoning Manufacturing",
  "Bottled Water & Beverage Manufacturing",
  "Winery & Vineyard Operations",
  "Distillery & Spirits Manufacturing",
  "Biofuel & Ethanol Manufacturing",
  "Recycling & Reclamation Manufacturing",
  "Nanomaterial Manufacturing",
  "Composite Material Manufacturing",
  "Carbon Fiber Manufacturing",
  "Graphene Production",
  "Bioplastic Manufacturing",
  "Smart Material Manufacturing",
  "Quantum Dot Manufacturing",
  "MEMS & Nanofabrication",
  "Thin-Film Manufacturing",
  "Roll-to-Roll Processing",
  "Continuous Casting",
  "Powder Metallurgy",
  "Sintering & Compaction",
  "Vacuum Forming & Thermoforming",
  "Blow Molding & Extrusion",
  "Rotational Molding",
  "Compression Molding",
  "Resin Transfer Molding",
  "Sheet Metal Forming & Bending",
  "Tube & Pipe Manufacturing",
  "Wire & Cable Manufacturing",
  "Fiber Optic Cable Manufacturing",
  "Coaxial Cable Manufacturing",
  "Electrical Conduit Manufacturing",
  "Switchgear & Panelboard Manufacturing",
  "Transformer & Inductor Manufacturing",
  "Electric Motor Manufacturing",
  "Generator & Alternator Manufacturing",
  "Power Distribution Equipment Manufacturing",
  "Circuit Breaker & Fuse Manufacturing",
  "Capacitor & Resistor Manufacturing",
  "Diode & Transistor Manufacturing",
  "Integrated Circuit Packaging",
  "LED & OLED Manufacturing",
  "Display Panel Manufacturing",
  "Touchscreen & Sensor Manufacturing",
  "Camera & Imaging Sensor Manufacturing",
  "Microphone & Audio Transducer Manufacturing",
  "Speaker & Headphone Manufacturing",
  "Antenna & RF Component Manufacturing",
  "Satellite Component Manufacturing",
  "Drone & UAV Manufacturing",
  "Autonomous Vehicle Sensor Manufacturing",
];

const MA_100: string[] = [
  "Horizontal M&A (Same Industry)",
  "Vertical M&A (Supply Chain)",
  "Conglomerate M&A (Unrelated)",
  "Hostile Takeover",
  "Friendly Acquisition",
  "Asset Purchase Transaction",
  "Stock Purchase Transaction",
  "Merger of Equals",
  "Reverse Merger (SPAC)",
  "Tender Offer",
  "Management Buyout (MBO)",
  "Leveraged Buyout (LBO)",
  "Distressed M&A (Bankruptcy)",
  "Cross-Border M&A",
  "Roll-Up Strategy (Consolidation)",
  "Bolt-On Acquisition",
  "Platform Acquisition",
  "Carve-Out / Spin-Off",
  "Divestiture & Asset Sale",
  "Joint Venture Formation",
  "Strategic Alliance (Non-Equity)",
  "Private Equity Acquisition",
  "Venture Capital Acquisition",
  "Family Office Acquisition",
  "Search Fund Acquisition",
  "ESOP Buyout",
  "Management Recapitalization",
  "Dividend Recapitalization",
  "PIPE Investment (Private Investment in Public Equity)",
  "Take-Private Transaction",
  "Public-to-Public Merger",
  "Minority Stake Acquisition",
  "Control Stake Acquisition",
  "Creeping Acquisition (Gradual)",
  "White Knight Defense",
  "Pac-Man Defense",
  "Poison Pill Defense",
  "Golden Parachute Arrangement",
  "Staggered Board Defense",
  "Crown Jewel Defense",
  "Greenmail Defense",
  "Scorched Earth Defense",
  "Breakup Fee & Reverse Breakup Fee",
  "Earnout Structure",
  "Seller Financing",
  "Stapled Financing",
  "Locked-Box Mechanism",
  "Closing Accounts Mechanism",
  "Net Working Capital Adjustment",
  "Representations & Warranties Insurance (R&W)",
  "Tax Indemnity & Tax Insurance",
  "Environmental Indemnity",
  "IP Indemnity & Escrow",
  "Litigation Holdback",
  "Indemnity Escrow",
  "Purchase Price Adjustment",
  "Contingent Value Right (CVR)",
  "Deferred Consideration",
  "Equity Roll-Over",
  "Management Incentive Plan",
  "Phantom Equity Plan",
  "Employee Retention Agreement",
  "Non-Compete & Non-Solicit",
  "Transition Services Agreement (TSA)",
  "Shared Services Agreement",
  "Cost Synergy Realization",
  "Revenue Synergy Realization",
  "Integration Playbook Development",
  "Day-One Readiness",
  "Post-Merger Integration (PMI)",
  "Cultural Integration",
  "IT Systems Integration",
  "ERP Integration & Consolidation",
  "HR Integration & Payroll Merge",
  "Customer Integration & CRM Merge",
  "Brand Integration Strategy",
  "Product Line Rationalization",
  "Facility Consolidation",
  "Workforce Reduction & Restructuring",
  "Supply Chain Integration",
  "Procurement Synergy Capture",
  "Finance & Treasury Integration",
  "Legal Entity Rationalization",
  "Tax Structure Optimization",
  "Transfer Pricing Restructuring",
  "IP Migration & Valuation",
  "Valuation: DCF Method",
  "Valuation: Comparable Company Analysis",
  "Valuation: Precedent Transaction Analysis",
  "Valuation: LBO Analysis",
  "Valuation: Asset-Based Approach",
  "Valuation: Replacement Cost",
  "Valuation: Real Options Method",
  "Fairness Opinion Preparation",
  "Solvency Opinion Preparation",
  "Regulatory Approval: HSR Filing",
  "Regulatory Approval: CFIUS Review",
  "Regulatory Approval: Antitrust / DOJ / FTC",
  "Regulatory Approval: EU Merger Control",
  "Regulatory Approval: Foreign Investment Review",
  "SEC Filing: Schedule TO",
  "SEC Filing: Schedule 14D-9",
  "SEC Filing: Form S-4",
  "SEC Filing: Proxy Statement",
  "Due Diligence: Financial DD",
  "Due Diligence: Legal DD",
  "Due Diligence: Tax DD",
  "Due Diligence: Commercial DD",
  "Due Diligence: Operational DD",
  "Due Diligence: IT DD",
  "Due Diligence: HR DD",
  "Due Diligence: Environmental DD",
  "Due Diligence: IP & Technology DD",
  "Due Diligence: Regulatory DD",
  "Due Diligence: Insurance DD",
  "Data Room Preparation & Management",
  "Auction Process (Single / Multi-Stage)",
  "Exclusive Negotiation Period",
  "Letter of Intent (LOI) Negotiation",
  "Term Sheet Negotiation",
  "Definitive Agreement Drafting",
  "Closing & Funding Coordination",
];

function Section({ title, icon, color, categories }: { title: string; icon: React.ReactNode; color: string; categories: string[] }) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${color}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-semibold tracking-wide">{title}</span>
          <span className="text-xs text-muted-foreground/60">{categories.length} subcategories</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-1 border-t border-white/5">
          <ul className="space-y-1">
            {categories.map((c, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className={`mt-1 w-1 h-1 rounded-full ${theme.accentBg}`} />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const [search, setSearch] = useState("");
  const { theme } = useTheme();

  const sections: CategorySection[] = [
    { industry: "Technology", icon: <Monitor className="w-4 h-4" />, count: TECH_ADDITIONAL.length, color: "border-cyan-500/20", categories: TECH_ADDITIONAL },
    { industry: "Financial Services", icon: <Landmark className="w-4 h-4" />, count: FINANCIAL_ADDITIONAL.length, color: "border-emerald-500/20", categories: FINANCIAL_ADDITIONAL },
    { industry: "Lending", icon: <CreditCard className="w-4 h-4" />, count: LENDING_ADDITIONAL.length, color: "border-blue-500/20", categories: LENDING_ADDITIONAL },
    { industry: "Legal", icon: <Scale className="w-4 h-4" />, count: LEGAL_ADDITIONAL.length, color: "border-indigo-500/20", categories: LEGAL_ADDITIONAL },
    { industry: "Personal Injury", icon: <Heart className="w-4 h-4" />, count: PI_ADDITIONAL.length, color: "border-red-500/20", categories: PI_ADDITIONAL },
    { industry: "Marketing & Advertising", icon: <Megaphone className="w-4 h-4" />, count: MARKETING_ADDITIONAL.length, color: "border-pink-500/20", categories: MARKETING_ADDITIONAL },
    { industry: "Staffing & HR", icon: <Users className="w-4 h-4" />, count: STAFFING_ADDITIONAL.length, color: "border-violet-500/20", categories: STAFFING_ADDITIONAL },
    { industry: "Healthcare", icon: <Stethoscope className="w-4 h-4" />, count: HEALTHCARE_ADDITIONAL.length, color: "border-teal-500/20", categories: HEALTHCARE_ADDITIONAL },
    { industry: "Real Estate", icon: <Home className="w-4 h-4" />, count: REAL_ESTATE_ADDITIONAL.length, color: "border-amber-500/20", categories: REAL_ESTATE_ADDITIONAL },
    { industry: "Manufacturing", icon: <Factory className="w-4 h-4" />, count: MANUFACTURING_100.length, color: "border-orange-500/20", categories: MANUFACTURING_100 },
    { industry: "M&A", icon: <ArrowLeftRight className="w-4 h-4" />, count: MA_100.length, color: "border-yellow-500/20", categories: MA_100 },
    { industry: "Energy", icon: <Zap className="w-4 h-4" />, count: ENERGY_ADDITIONAL.length, color: "border-yellow-500/20", categories: ENERGY_ADDITIONAL },
    { industry: "Professional Services", icon: <Briefcase className="w-4 h-4" />, count: PROFESSIONAL_ADDITIONAL.length, color: "border-slate-500/20", categories: PROFESSIONAL_ADDITIONAL },
    { industry: "Construction & Engineering", icon: <Hammer className="w-4 h-4" />, count: CONSTRUCTION_ADDITIONAL.length, color: "border-stone-500/20", categories: CONSTRUCTION_ADDITIONAL },
    { industry: "Automotive", icon: <Car className="w-4 h-4" />, count: AUTOMOTIVE_ADDITIONAL.length, color: "border-rose-500/20", categories: AUTOMOTIVE_ADDITIONAL },
    { industry: "Insurance", icon: <Shield className="w-4 h-4" />, count: INSURANCE_ADDITIONAL.length, color: "border-sky-500/20", categories: INSURANCE_ADDITIONAL },
    { industry: "Travel & Hospitality", icon: <Plane className="w-4 h-4" />, count: TRAVEL_ADDITIONAL.length, color: "border-cyan-500/20", categories: TRAVEL_ADDITIONAL },
    { industry: "Education & Training", icon: <GraduationCap className="w-4 h-4" />, count: EDUCATION_ADDITIONAL.length, color: "border-green-500/20", categories: EDUCATION_ADDITIONAL },
    { industry: "Food & Beverage", icon: <Utensils className="w-4 h-4" />, count: FOOD_ADDITIONAL.length, color: "border-orange-500/20", categories: FOOD_ADDITIONAL },
    { industry: "Fitness & Wellness", icon: <Dumbbell className="w-4 h-4" />, count: FITNESS_ADDITIONAL.length, color: "border-red-500/20", categories: FITNESS_ADDITIONAL },
    { industry: "Beauty & Personal Care", icon: <Sparkles className="w-4 h-4" />, count: BEAUTY_ADDITIONAL.length, color: "border-fuchsia-500/20", categories: BEAUTY_ADDITIONAL },
    { industry: "Entertainment & Media", icon: <Film className="w-4 h-4" />, count: MEDIA_ADDITIONAL.length, color: "border-purple-500/20", categories: MEDIA_ADDITIONAL },
    { industry: "Trades & Home Services", icon: <TruckIcon className="w-4 h-4" />, count: TRADE_ADDITIONAL.length, color: "border-gray-500/20", categories: TRADE_ADDITIONAL },
    { industry: "Veterinary & Animal Services", icon: <TreePine className="w-4 h-4" />, count: VET_ADDITIONAL.length, color: "border-green-500/20", categories: VET_ADDITIONAL },
    { industry: "Specialty Wellness", icon: <Leaf className="w-4 h-4" />, count: WELLNESS_ADDITIONAL.length, color: "border-lime-500/20", categories: WELLNESS_ADDITIONAL },
    { industry: "Niche Consulting & Compliance", icon: <Shield className="w-4 h-4" />, count: CONSULTING_ADDITIONAL.length, color: "border-zinc-500/20", categories: CONSULTING_ADDITIONAL },
    { industry: "Skilled Trades", icon: <Hammer className="w-4 h-4" />, count: SKILLED_TRADES_ADDITIONAL.length, color: "border-stone-500/20", categories: SKILLED_TRADES_ADDITIONAL },
    { industry: "High Ticket Closing", icon: <Crown className="w-4 h-4" />, count: HIGH_TICKET_ADDITIONAL.length, color: "border-amber-500/20", categories: HIGH_TICKET_ADDITIONAL },
    { industry: "Bail Bonds", icon: <BadgeDollarSign className="w-4 h-4" />, count: DARK_BAIL_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_BAIL_ADDITIONAL },
    { industry: "Debt & Collections", icon: <DollarSign className="w-4 h-4" />, count: DARK_DEBT_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_DEBT_ADDITIONAL },
    { industry: "Adult Industry Services", icon: <Flame className="w-4 h-4" />, count: DARK_ADULT_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_ADULT_ADDITIONAL },
    { industry: "Cannabis & Psychedelics", icon: <Leaf className="w-4 h-4" />, count: DARK_CANNABIS_ADDITIONAL.length, color: "border-green-900/20", categories: DARK_CANNABIS_ADDITIONAL },
    { industry: "Firearms & Defense", icon: <Shield className="w-4 h-4" />, count: DARK_FIREARMS_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_FIREARMS_ADDITIONAL },
    { industry: "Gambling & Gaming", icon: <Gem className="w-4 h-4" />, count: DARK_GAMBLING_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_GAMBLING_ADDITIONAL },
    { industry: "Pawn & Secondhand", icon: <TrendingUp className="w-4 h-4" />, count: DARK_PAWN_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_PAWN_ADDITIONAL },
    { industry: "Towing & Recovery", icon: <Truck className="w-4 h-4" />, count: DARK_TOWING_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_TOWING_ADDITIONAL },
    { industry: "Waste & Disposal", icon: <ZapOff className="w-4 h-4" />, count: DARK_WASTE_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_WASTE_ADDITIONAL },
    { industry: "Repo & Asset Seizure", icon: <Truck className="w-4 h-4" />, count: DARK_REPO_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_REPO_ADDITIONAL },
    { industry: "Pest & Wildlife Control", icon: <Bug className="w-4 h-4" />, count: DARK_PEST_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_PEST_ADDITIONAL },
    { industry: "Liquidation & Distressed Assets", icon: <TrendingUp className="w-4 h-4" />, count: DARK_LIQUIDATION_ADDITIONAL.length, color: "border-red-900/20", categories: DARK_LIQUIDATION_ADDITIONAL },
  ];

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections.filter(s =>
      s.industry.toLowerCase().includes(q) ||
      s.categories.some(c => c.toLowerCase().includes(q))
    );
  }, [search, sections]);

  const total = sections.reduce((sum, s) => sum + s.categories.length, 0);

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 space-y-4" data-testid="docs-page">
      <div className="flex items-center gap-3">
        <BookOpen className={`w-5 h-5 ${theme.accentClass}`} />
        <h1 className="text-lg font-semibold tracking-wide">Industry Subcategory Directory</h1>
      </div>

      <div className="text-xs text-gray-500">
        {total} subcategories across {sections.length} industries. Real Estate: {REAL_ESTATE_ADDITIONAL.length}, Manufacturing: {MANUFACTURING_100.length}, M&A: {MA_100.length}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subcategories..."
          className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded text-sm text-white focus:border-cyan-500 focus:outline-none"
          data-testid="input-docs-search"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((s) => (
          <Section key={s.industry} title={s.industry} icon={s.icon} color={s.color} categories={s.categories} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-sm text-gray-500 py-12">No matching subcategories found.</div>
      )}
    </div>
  );
}
