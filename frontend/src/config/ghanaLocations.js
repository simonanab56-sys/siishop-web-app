/**
 * Ghana Locations Configuration (Frontend)
 * Contains all 16 regions and their cities/towns
 */

export const regions = [
  "Greater Accra",
  "Ashanti",
  "Central",
  "Eastern",
  "Western",
  "Western North",
  "Bono",
  "Bono East",
  "Ahafo",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
];

// Cities mapped by region
export const citiesByRegion = {
  "Greater Accra": [
    "Accra",
    "Tema",
    "Madina",
    "Kasoa",
    "Teshie",
    "Nungua",
    "Tema New Town",
    "Sakumono",
    "Kpong",
    "Ada",
  ],
  "Ashanti": [
    "Kumasi",
    "Obuasi",
    "Mampong",
    "Ejura",
    "Bekwai",
    "Asante Mampong",
    "Konongo",
    "Agogo",
    "Bompata",
    "Effiduase",
  ],
  "Central": [
    "Cape Coast",
    "Kumasi",
    "Elmina",
    "Mankessim",
    "Apam",
    "Winneba",
    "Gomoa",
    "Ajumako",
    "Abura",
    "Nsaba",
  ],
  "Eastern": [
    "Koforidua",
    "Akwapim",
    "Akim",
    "Birim",
    "Akyem",
    "Suhum",
    "Nkawkaw",
    "Akwatia",
    "Mumford",
    "Adu",
  ],
  "Western": [
    "Sekondi",
    "Takoradi",
    "Ahanta",
    "Effia",
    "Kwesimintsim",
    "Foso",
    "Boin",
    "Banos",
    "Nzul",
    "Lower",
  ],
  "Western North": [
    "Sefwi",
    "Wiawso",
    "Bonsu",
    "Kojina",
    "Pamu",
    "Debiso",
    "Bibiani",
    "Asanwinso",
    "Kwabeng",
    "Anhwiam",
  ],
  "Bono": [
    "Sunyani",
    "Bono",
    "Goaso",
    "Drobon",
    "Atebubu",
    "Techiman",
    "Nkoranza",
    "Buipe",
    "Sani",
    "Zabzugu",
  ],
  "Bono East": [
    "Techiman",
    "Bono East",
    "Atebubu",
    "Nkoranza",
    "Pru",
    "Sene",
    "Dagomba",
    "Kintampo",
    "Bui",
    "Lashibi",
  ],
  "Ahafo": [
    "Acherensua",
    "Akrodie",
    "Bechem",
    "Bomaa",
    "Duayaw Nkwanta",
    "Dwommo",
    "Goaso",
    "Hwidiem",
    "Kasapin",
    "Kenyasi",
    "Kukuom",
    "Kwadwo Addaikrom",
    "Mim",
    "Ntotroso",
    "Nkesiem",
    "Sankore",
    "Techimantia",
    "Tutuka",
    "Wamahinso",
    "Yamfo",
  ],
  "Volta": [
    "Ho",
    "Ketu",
    "Akatsi",
    "Ho West",
    "Kpando",
    "Hohoe",
    "Keta",
    "Sogakope",
    "Aflao",
    "Dakpla",
  ],
  "Oti": [
    "Dambai",
    "Oti",
    "Nkwanta",
    "Kpassa",
    "Nakpanduri",
    "Bimbila",
    "Kete Krachi",
    "Salaga",
    "Saboba",
    "Yendi",
  ],
  "Northern": [
    "Tamale",
    "Yendi",
    "Savelugu",
    "Kumbum",
    "Mamprusi",
    "Garu",
    "Buipe",
    "Sang",
    "Kulmasa",
    "Gbewaa",
  ],
  "Savannah": [
    "Damongo",
    "Savannah",
    "Bole",
    "Bamboi",
    "Salaga",
    "Tolon",
    "Kumbum",
    "Garu",
    "Buipe",
    "Bui",
  ],
  "North East": [
    "Nalerigu",
    "North East",
    "Garu",
    "Bawku",
    "Bawku West",
    "Mamprusi",
    "Kulmasa",
    "Pigu",
    "Bachie",
    "Warib",
  ],
  "Upper East": [
    "Bolgatanga",
    "Bawku",
    "Bawku West",
    "Navrongo",
    "Paga",
    "Kulmasa",
    "Zebilla",
    "Banie",
    "Tongo",
    "Bawyina",
  ],
  "Upper West": [
    "Wa",
    "Lawra",
    "Jema",
    "Nandom",
    "Kalle",
    "Funsi",
    "Daffiama",
    "Issa",
    "Lambo",
    "Sombo",
  ],
};

/**
 * Get all cities for a given region
 * @param {string} region - The region name
 * @returns {string[]} Array of cities
 */
export function getCitiesByRegion(region) {
  return citiesByRegion[region] || [];
}

/**
 * Get all available regions
 * @returns {string[]} Array of regions
 */
export function getRegions() {
  return regions;
}

/**
 * Check if a region exists
 * @param {string} region - The region name
 * @returns {boolean}
 */
export function isValidRegion(region) {
  return regions.includes(region);
}

/**
 * Check if a city is valid for a region
 * @param {string} region - The region name
 * @param {string} city - The city name
 * @returns {boolean}
 */
export function isValidCity(region, city) {
  const cities = citiesByRegion[region] || [];
  return cities.includes(city);
}

/**
 * Format location for display
 * @param {object} location - Location object with country, region, city
 * @returns {string} Formatted location string
 */
export function formatLocation(location) {
  if (!location || !location.region || !location.city) {
    return "Location not specified";
  }
  return `${location.city}, ${location.region}`;
}

export default {
  regions,
  citiesByRegion,
  getCitiesByRegion,
  getRegions,
  isValidRegion,
  isValidCity,
  formatLocation,
};