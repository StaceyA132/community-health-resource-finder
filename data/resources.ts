export type ResourceCategory =
  | "mental-health"
  | "emergency-care"
  | "womens-health"
  | "pharmacy"
  | "dental"
  | "food"
  | "shelter";

export type Resource = {
  id: string;
  name: string;
  categories: ResourceCategory[];
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  website?: string;
  hours: string;
  cost: string;
  eligibility: string;
  coordinates: { lat: number; lng: number };
};

export const categoryLabels: Record<ResourceCategory, string> = {
  "mental-health": "Mental Health",
  "emergency-care": "Emergency Care",
  "womens-health": "Women’s Health",
  pharmacy: "Pharmacy",
  dental: "Dental",
  food: "Food Banks",
  shelter: "Shelter"
};

export const zipCoordinates: Record<string, { lat: number; lng: number; city: string }> = {
  "94103": { lat: 37.7749, lng: -122.4194, city: "San Francisco, CA" },
  "10001": { lat: 40.7128, lng: -74.006, city: "New York, NY" },
  "60601": { lat: 41.8781, lng: -87.6298, city: "Chicago, IL" },
  "30301": { lat: 33.749, lng: -84.388, city: "Atlanta, GA" },
  "78701": { lat: 30.2672, lng: -97.7431, city: "Austin, TX" }
};

export const resources: Resource[] = [
  {
    id: "sf-free-clinic",
    name: "San Francisco Free Clinic",
    categories: ["womens-health", "dental"],
    description: "Free and low-cost primary care, women’s health screenings, and dental referrals.",
    address: "4900 California St",
    city: "San Francisco",
    state: "CA",
    zip: "94118",
    phone: "(415) 750-9894",
    website: "https://www.sffreeclinic.org",
    hours: "Mon–Fri 8a–5p",
    cost: "Free or sliding scale",
    eligibility: "Uninsured or underinsured",
    coordinates: { lat: 37.7846, lng: -122.4605 }
  },
  {
    id: "sf-night-shelter",
    name: "Hope Shelter",
    categories: ["shelter", "food"],
    description: "Overnight beds, warm meals, and case management support.",
    address: "101 Mission St",
    city: "San Francisco",
    state: "CA",
    zip: "94103",
    phone: "(415) 555-2901",
    website: "https://www.hopeshelter.org",
    hours: "Check-in 4p–7p daily",
    cost: "Free",
    eligibility: "Adults; ID requested but not required",
    coordinates: { lat: 37.7916, lng: -122.3966 }
  },
  {
    id: "sf-mental-health",
    name: "Community Mental Health Hub",
    categories: ["mental-health"],
    description: "Walk-in counseling, crisis support, and weekly group sessions.",
    address: "1250 Market St",
    city: "San Francisco",
    state: "CA",
    zip: "94103",
    phone: "(415) 555-8830",
    website: "https://www.cmhhub.org",
    hours: "Mon–Sat 10a–8p",
    cost: "Free for SF residents",
    eligibility: "Open to all; priority for SF residents",
    coordinates: { lat: 37.7763, lng: -122.4167 }
  },
  {
    id: "nyc-urgent-care",
    name: "CityCare Urgent",
    categories: ["emergency-care", "pharmacy"],
    description: "24/7 urgent care with on-site low-cost pharmacy.",
    address: "455 8th Ave",
    city: "New York",
    state: "NY",
    zip: "10001",
    phone: "(212) 555-2200",
    website: "https://www.citycareurgent.org",
    hours: "24/7",
    cost: "Sliding scale",
    eligibility: "Open to all",
    coordinates: { lat: 40.7536, lng: -73.9946 }
  },
  {
    id: "nyc-womens-health",
    name: "Harlem Women’s Health Collective",
    categories: ["womens-health", "mental-health"],
    description: "Prenatal care, reproductive health, counseling, and support groups.",
    address: "250 W 135th St",
    city: "New York",
    state: "NY",
    zip: "10030",
    phone: "(212) 555-3300",
    website: "https://www.hwhc.org",
    hours: "Mon–Fri 9a–6p",
    cost: "Free or low-cost",
    eligibility: "Women and gender-expansive patients",
    coordinates: { lat: 40.8171, lng: -73.946 }
  },
  {
    id: "chi-dental",
    name: "Bright Smiles Clinic",
    categories: ["dental"],
    description: "Teeth cleanings, fillings, and preventive care for adults and kids.",
    address: "200 W Madison St",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    phone: "(312) 555-1200",
    website: "https://www.brightsmiles.org",
    hours: "Tue–Sat 9a–5p",
    cost: "Sliding scale",
    eligibility: "Open to all; income-based discount",
    coordinates: { lat: 41.8821, lng: -87.6347 }
  },
  {
    id: "atlanta-food",
    name: "Peachtree Food Bank",
    categories: ["food"],
    description: "Weekly grocery pickup and hot meals twice daily.",
    address: "50 Peachtree St",
    city: "Atlanta",
    state: "GA",
    zip: "30301",
    phone: "(404) 555-9000",
    website: "https://www.peachtreefoodbank.org",
    hours: "Mon–Sat 8a–7p",
    cost: "Free",
    eligibility: "Proof of address requested",
    coordinates: { lat: 33.755, lng: -84.3907 }
  },
  {
    id: "austin-mental-health",
    name: "Austin Mindful Care",
    categories: ["mental-health"],
    description: "Crisis counseling, telehealth sessions, and peer groups.",
    address: "300 Congress Ave",
    city: "Austin",
    state: "TX",
    zip: "78701",
    phone: "(512) 555-7770",
    website: "https://www.mindfulcareatx.org",
    hours: "Mon–Sun 7a–10p",
    cost: "Low-cost",
    eligibility: "Open to all; telehealth across TX",
    coordinates: { lat: 30.2654, lng: -97.743 }
  }
];
